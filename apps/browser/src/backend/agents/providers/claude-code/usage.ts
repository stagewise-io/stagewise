import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ProviderUsageLimits } from '@shared/karton-contracts/ui/shared-types';
import { resolveAcpEnvironment } from '../../acp/adapter';

const execFileAsync = promisify(execFile);

interface ClaudeUsageWindow {
  utilization?: number | null;
}

interface ClaudeUsageResponse {
  five_hour?: ClaudeUsageWindow | null;
  seven_day?: ClaudeUsageWindow | null;
}

interface ClaudeCredentials {
  claudeAiOauth?: { accessToken?: string };
}

let pendingUsage: Promise<ProviderUsageLimits> | undefined;
let environmentPromise: Promise<NodeJS.ProcessEnv | null> | undefined;

function parseAccessToken(contents: string): string | undefined {
  try {
    return (JSON.parse(contents) as ClaudeCredentials).claudeAiOauth
      ?.accessToken;
  } catch {
    return undefined;
  }
}

async function readAccessToken(
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  if (env.CLAUDE_CODE_OAUTH_TOKEN) return env.CLAUDE_CODE_OAUTH_TOKEN;
  const configDir = env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  try {
    const token = parseAccessToken(
      await readFile(join(configDir, '.credentials.json'), 'utf8'),
    );
    if (token) return token;
  } catch {}
  if (process.platform !== 'darwin') return undefined;
  try {
    const storageDir =
      env.CLAUDE_SECURESTORAGE_CONFIG_DIR ?? env.CLAUDE_CONFIG_DIR;
    const service = storageDir
      ? `Claude Code-credentials-${createHash('sha256')
          .update(storageDir.normalize('NFC'))
          .digest('hex')
          .slice(0, 8)}`
      : 'Claude Code-credentials';
    const { stdout } = await execFileAsync(
      'security',
      ['find-generic-password', '-a', userInfo().username, '-w', '-s', service],
      { encoding: 'utf8', timeout: 2_000 },
    );
    return parseAccessToken(stdout.trim());
  } catch {
    return undefined;
  }
}

function formatClaudeUsage(response: ClaudeUsageResponse): ProviderUsageLimits {
  const windows = [
    ['5h', response.five_hour?.utilization],
    ['1w', response.seven_day?.utilization],
  ] as const;
  return windows.flatMap(([label, usedPercent]) =>
    typeof usedPercent === 'number' ? [{ label, usedPercent }] : [],
  );
}

async function readClaudeUsageLimits(): Promise<ProviderUsageLimits> {
  environmentPromise ??= resolveAcpEnvironment();
  const shellEnv = (await environmentPromise) ?? {};
  const accessToken = await readAccessToken({ ...process.env, ...shellEnv });
  if (!accessToken) return [];
  const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: {
      authorization: `Bearer ${accessToken}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'user-agent': 'claude-code/2.1',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Claude usage failed (${response.status})`);
  return formatClaudeUsage((await response.json()) as ClaudeUsageResponse);
}

export function getClaudeCodeUsageLimits(): Promise<ProviderUsageLimits> {
  pendingUsage ??= readClaudeUsageLimits().finally(() => {
    pendingUsage = undefined;
  });
  return pendingUsage;
}
