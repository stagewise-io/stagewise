import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderUsageLimits } from '@shared/karton-contracts/ui/shared-types';
import { resolveAcpEnvironment } from '../../acp/adapter';

interface OpenCodeUsageResponse {
  usage?: {
    rolling?: OpenCodeUsageWindow;
    weekly?: OpenCodeUsageWindow;
    monthly?: OpenCodeUsageWindow;
  };
}

interface OpenCodeUsageWindow {
  percent?: number;
}

let pendingUsage: Promise<ProviderUsageLimits> | undefined;
let environmentPromise: Promise<NodeJS.ProcessEnv | null> | undefined;

function authFilePath(env: NodeJS.ProcessEnv): string {
  const dataHome = env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(dataHome, 'opencode', 'auth.json');
}

async function readApiKey(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  try {
    const contents = env.OPENCODE_AUTH_CONTENT
      ? env.OPENCODE_AUTH_CONTENT
      : await readFile(authFilePath(env), 'utf8');
    const auth = JSON.parse(contents) as Record<
      string,
      { type?: string; key?: string }
    >;
    const credential = auth['opencode-go'];
    return credential?.type === 'api' ? credential.key : undefined;
  } catch {
    return undefined;
  }
}

export function formatOpenCodeUsage(
  response: OpenCodeUsageResponse,
): ProviderUsageLimits {
  const windows = [
    ['5h', response.usage?.rolling?.percent],
    ['1w', response.usage?.weekly?.percent],
    ['1mo', response.usage?.monthly?.percent],
  ] as const;
  return windows.flatMap(([label, usedPercent]) =>
    typeof usedPercent === 'number' ? [{ label, usedPercent }] : [],
  );
}

async function readOpenCodeUsageLimits(): Promise<ProviderUsageLimits> {
  environmentPromise ??= resolveAcpEnvironment();
  const shellEnv = (await environmentPromise) ?? {};
  const apiKey = await readApiKey({ ...process.env, ...shellEnv });
  if (!apiKey) return [];
  const response = await fetch('https://opencode.ai/zen/go/v1/usage', {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`OpenCode usage failed (${response.status})`);
  return formatOpenCodeUsage((await response.json()) as OpenCodeUsageResponse);
}

export function getOpenCodeUsageLimits(): Promise<ProviderUsageLimits> {
  pendingUsage ??= readOpenCodeUsageLimits().finally(() => {
    pendingUsage = undefined;
  });
  return pendingUsage;
}
