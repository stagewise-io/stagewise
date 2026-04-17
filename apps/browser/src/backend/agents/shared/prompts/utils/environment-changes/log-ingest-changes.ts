import type { EnvironmentChangeEntry } from './types';

/**
 * Compares two logIngest snapshots and produces change entries
 * when the ingest server starts, stops, or restarts with a new port/token.
 *
 * - `null → {port, token}` — server started
 * - `{port, token} → null` — server stopped
 * - `{port1} → {port2}` or token change — server restarted (new port/token)
 * - `null → null` / identical — no change
 */
export function computeLogIngestChanges(
  previous: { port: number; token: string } | null,
  current: { port: number; token: string } | null,
): EnvironmentChangeEntry[] {
  if (!previous && !current) return [];

  if (!previous && current) {
    return [
      {
        type: 'log-ingest-started',
        attributes: {
          port: String(current.port),
          token: current.token,
        },
      },
    ];
  }

  if (previous && !current) return [{ type: 'log-ingest-stopped' }];

  // Both non-null — check for port/token change (app restart)
  if (previous!.port !== current!.port || previous!.token !== current!.token) {
    return [
      {
        type: 'log-ingest-restarted',
        attributes: {
          port: String(current!.port),
          token: current!.token,
        },
      },
    ];
  }

  return [];
}
