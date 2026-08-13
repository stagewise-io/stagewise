import type { ProviderUsageLimits } from '@shared/karton-contracts/ui/shared-types';
import {
  CodexAppServerClient,
  type CodexRateLimitWindow,
} from './app-server-client';

let pendingUsage: Promise<ProviderUsageLimits> | undefined;

export function formatCodexUsageWindow(
  window: CodexRateLimitWindow | null | undefined,
): ProviderUsageLimits[number] | null {
  const durationMins = window?.windowDurationMins;
  if (!durationMins) return null;
  const label =
    durationMins % 10_080 === 0
      ? `${durationMins / 10_080}w`
      : durationMins % 1_440 === 0
        ? `${durationMins / 1_440}d`
        : durationMins % 60 === 0
          ? `${durationMins / 60}h`
          : `${durationMins}m`;
  return {
    label,
    usedPercent: window.usedPercent,
  };
}

async function readCodexUsageLimits(): Promise<ProviderUsageLimits> {
  const client = new CodexAppServerClient(console);
  try {
    const limits = await client.readRateLimits();
    const windows = [limits.primary, limits.secondary]
      .map(formatCodexUsageWindow)
      .filter((window) => window !== null);
    return windows;
  } finally {
    client.close();
  }
}

export function getCodexUsageLimits(): Promise<ProviderUsageLimits> {
  pendingUsage ??= readCodexUsageLimits().finally(() => {
    pendingUsage = undefined;
  });
  return pendingUsage;
}
