import type { EnvironmentChangeEntry } from './types';

/**
 * Compares two sandbox session IDs and produces a change description
 * reflecting sandbox lifecycle transitions.
 *
 * - `id → null`   — session ended (e.g. app restart before sandbox re-init)
 * - `null → id`   — new session started (e.g. first use or re-init after restart)
 * - `id1 → id2`   — session was reset (e.g. worker crash recovery)
 * - `null → null`  / `id → same id` — no change
 */
export function computeSandboxChanges(
  prevSessionId: string | null,
  currSessionId: string | null,
): EnvironmentChangeEntry[] {
  if (!prevSessionId || !currSessionId) return [];
  if (prevSessionId === currSessionId) return [];

  return [{ type: 'sandbox-restarted' }];
}
