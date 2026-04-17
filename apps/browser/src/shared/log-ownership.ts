/**
 * Determines which log channel files an agent has written to by
 * scanning its message history for write / multiEdit tool calls
 * whose `path` targets `logs/*.jsonl`.
 *
 * Pure function — no Node.js or browser dependencies. Usable from
 * both the backend (ToolboxService) and the UI (React components).
 */

/** Mount prefix for the global logs directory. */
export const LOGS_PREFIX = 'logs';

/**
 * Returns `true` when `relativePath` points to a log channel file
 * inside the `logs/` mount (e.g. `logs/react-performance.jsonl`).
 */
export function isLogPath(relativePath: string): boolean {
  return (
    relativePath.startsWith(`${LOGS_PREFIX}/`) &&
    relativePath.endsWith('.jsonl')
  );
}

/**
 * Minimal message shape accepted by the ownership scanner.
 * Compatible with `AgentMessage` without importing heavy AI-SDK types.
 */
export interface LogOwnershipScanMessage {
  role: string;
  parts: ReadonlyArray<{
    type: string;
    input?: unknown;
  }>;
}

/**
 * Scan an agent's message history and return the set of
 * mount-prefixed log file paths it has written to.
 *
 * Matches tool parts of type `tool-write` and
 * `tool-multiEdit` whose `path` starts with
 * `logs/` and ends with `.jsonl`.
 */
export function getAgentOwnedLogPaths(
  history: readonly LogOwnershipScanMessage[],
): Set<string> {
  const ownedPaths = new Set<string>();

  for (const msg of history) {
    if (msg.role !== 'assistant') continue;
    for (const part of msg.parts) {
      if (part.type !== 'tool-write' && part.type !== 'tool-multiEdit')
        continue;

      const input = part.input as { path?: string } | undefined;
      if (typeof input?.path === 'string' && isLogPath(input.path))
        ownedPaths.add(input.path);
    }
  }

  return ownedPaths;
}
