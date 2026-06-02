import type { Logger } from '@/services/logger';

/**
 * Resolve the mount path for a *new* agent. When the supplied
 * `workspacePath` lives inside a linked git worktree, we prefer to
 * mount the repository's main worktree instead — this is the path
 * most users intuitively associate with "the project" and keeps the
 * agent's runtime / LSP / shell rooted at the canonical checkout
 * regardless of which worktree the user happened to drop into.
 *
 * Returns `workspacePath` verbatim when:
 *   - the resolver returns `null` (not a worktree, or main lookup
 *     failed silently); or
 *   - the resolver throws (git binary error, permission issue, ...).
 *
 * Host-side because both cases above ultimately need access to
 * `gitService.getWorkspaceMainWorktreePath`, which the agent-core
 * package deliberately does not expose.
 */
export async function resolveNewAgentWorkspaceMountPath(
  workspacePath: string,
  getMainWorktreePath: (path: string) => Promise<string | null>,
  logger?: Pick<Logger, 'warn'>,
): Promise<string> {
  try {
    return (await getMainWorktreePath(workspacePath)) ?? workspacePath;
  } catch (error) {
    logger?.warn(
      `[AgentManager] Failed to resolve main worktree for workspace ${workspacePath}`,
      { error },
    );
    return workspacePath;
  }
}
