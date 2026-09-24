import type { ProviderUsageLimits } from '@shared/karton-contracts/ui/shared-types';
import { getLocalOpenCodeApiKey } from './local-auth';

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
  const apiKey = await getLocalOpenCodeApiKey('opencode-go');
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
