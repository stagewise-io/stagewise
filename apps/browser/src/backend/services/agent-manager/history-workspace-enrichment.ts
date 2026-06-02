import { access } from 'node:fs/promises';
import type { Logger } from '@/services/logger';
import type {
  AgentHistoryEntry,
  AgentHistoryWorkspaceEntry,
} from '@shared/karton-contracts/ui/agent';

/**
 * Augment persisted {@link AgentHistoryEntry} rows with host-resolvable
 * data the agent-core cannot compute itself:
 *
 *   - Drop persisted mounts whose directory no longer exists on disk
 *     (e.g. a worktree that was deleted between sessions). The agent
 *     row is kept; only the missing mount is filtered. Mirrors the
 *     re-mount skip in {@link MountManagerService.handleMountWorkspace}
 *     so the sidebar's worktree grouping stays consistent with the
 *     runtime.
 *   - Resolve a fresh git summary per surviving mount via the host
 *     `gitService`. Summaries are deduplicated per workspace path so
 *     pages with many agents that mount the same workspaces only pay
 *     for one git read.
 *
 * Existence checks are async (`fs.promises.access`) and deduplicated by
 * path so the sidebar history fetch never blocks the event loop, even
 * with large histories that share many mounts.
 *
 * Exposed as a plain function so it can be wired into agent-core's
 * `hooks.enrichHistoryEntries` from `main.ts` without leaking host
 * dependencies into the agent-core package.
 */
export async function enrichHistoryEntryWorkspaces(
  entries: AgentHistoryEntry[],
  getGitSummary: (
    workspacePath: string,
  ) => Promise<AgentHistoryWorkspaceEntry['git']>,
  logger?: Pick<Logger, 'warn'>,
): Promise<AgentHistoryEntry[]> {
  const existsByPath = new Map<string, Promise<boolean>>();
  const gitSummaryByPath = new Map<
    string,
    Promise<AgentHistoryWorkspaceEntry['git']>
  >();

  const resolveExists = (workspacePath: string) => {
    let promise = existsByPath.get(workspacePath);
    if (!promise) {
      promise = access(workspacePath).then(
        () => true,
        () => false,
      );
      existsByPath.set(workspacePath, promise);
    }
    return promise;
  };

  const resolveGitSummary = (workspacePath: string) => {
    let promise = gitSummaryByPath.get(workspacePath);
    if (!promise) {
      promise = Promise.resolve(getGitSummary(workspacePath)).catch((error) => {
        logger?.warn(
          `[AgentManager] Failed to resolve Git summary for history workspace ${workspacePath}`,
          { error },
        );
        return null;
      });
      gitSummaryByPath.set(workspacePath, promise);
    }
    return promise;
  };

  return await Promise.all(
    entries.map(async (entry) => {
      if (!entry.mountedWorkspaces) {
        return entry;
      }
      const annotated = await Promise.all(
        entry.mountedWorkspaces.map(async (workspace) => ({
          workspace,
          exists: await resolveExists(workspace.path),
        })),
      );
      const surviving = await Promise.all(
        annotated
          .filter(({ exists }) => exists)
          .map(async ({ workspace }) => ({
            ...workspace,
            git: await resolveGitSummary(workspace.path),
          })),
      );
      return { ...entry, mountedWorkspaces: surviving };
    }),
  );
}
