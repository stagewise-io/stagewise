/**
 * Determines which plan files an agent has written to by scanning
 * its message history for overwriteFile / multiEdit tool calls
 * whose `relative_path` targets `plans/*.md`.
 *
 * Pure function — no Node.js or browser dependencies. Usable from
 * both the backend (ToolboxService) and the UI (React components).
 */

/** Mount prefix for the global plans directory. */
export const PLANS_PREFIX = 'plans';

/**
 * Returns `true` when `relativePath` points to a plan markdown file
 * inside the `plans/` mount (e.g. `plans/my-plan.md`).
 */
export function isPlanPath(relativePath: string): boolean {
  return (
    relativePath.startsWith(`${PLANS_PREFIX}/`) && relativePath.endsWith('.md')
  );
}

/**
 * Minimal message shape accepted by the ownership scanner.
 * Compatible with `AgentMessage` without importing heavy AI-SDK types.
 */
export interface OwnershipScanMessage {
  role: string;
  parts: ReadonlyArray<{
    type: string;
    input?: unknown;
  }>;
}

/**
 * Scan an agent's message history and return the set of
 * mount-prefixed plan file paths it has written to.
 *
 * Matches tool parts of type `tool-overwriteFile` and
 * `tool-multiEdit` whose `relative_path` starts with
 * `plans/` and ends with `.md`.
 */
export function getAgentOwnedPlanPaths(
  history: readonly OwnershipScanMessage[],
): Set<string> {
  const ownedPaths = new Set<string>();

  for (const msg of history) {
    if (msg.role !== 'assistant') continue;
    for (const part of msg.parts) {
      if (part.type !== 'tool-overwriteFile' && part.type !== 'tool-multiEdit')
        continue;

      const input = part.input as { relative_path?: string } | undefined;
      if (
        typeof input?.relative_path === 'string' &&
        isPlanPath(input.relative_path)
      )
        ownedPaths.add(input.relative_path);
    }
  }

  return ownedPaths;
}

/**
 * Return the most recently written plan path from an agent's history.
 *
 * Walks backward through history so it short-circuits on the first
 * assistant message that wrote to a plan file.
 *
 * @returns The mount-prefixed plan path, or `null` if no plan was
 *          ever written by this agent.
 */
export function getLastOwnedPlanPath(
  history: readonly OwnershipScanMessage[],
): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    if (msg.role !== 'assistant') continue;

    // Scan parts in reverse so the last tool call in the message wins
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j]!;
      if (part.type !== 'tool-overwriteFile' && part.type !== 'tool-multiEdit')
        continue;

      const input = part.input as { relative_path?: string } | undefined;
      if (
        typeof input?.relative_path === 'string' &&
        isPlanPath(input.relative_path)
      )
        return input.relative_path;
    }
  }

  return null;
}
