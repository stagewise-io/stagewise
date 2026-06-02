import type { WorkspaceGitSummary } from '../../types/metadata';

/**
 * Lifecycle + user-notification hooks the host plugs into the core
 * `MountManager`. The core calls these at well-defined moments so the
 * host can manage per-workspace `ClientRuntimeNode` / `LspService`
 * instances, persist recently-opened-workspace metadata, and refresh
 * derived host UI state.
 */
export interface MountManagerHostHooks {
  /**
   * Called the first time a workspace path is attached (no other
   * agent was already using it). Awaited by `mountWorkspace` so the
   * host can finish spinning up `ClientRuntimeNode` / `LspService`
   * before the core issues its first `refreshWorkspaceInfo`.
   */
  onWorkspaceAttached?: (workspacePath: string) => Promise<void> | void;

  /**
   * Called when the last reference to a workspace path is released
   * (final `unmountWorkspace` or `clearAgentMounts`). Fire-and-forget
   * from the core's perspective.
   */
  onWorkspaceReleased?: (workspacePath: string) => void;

  /**
   * Notifies the host that the effective mount list for an instance
   * has changed (mount, unmount, or watcher-driven refresh). The host
   * typically uses this to rebuild slash-command skill lists.
   */
  onMountsChanged?: (agentInstanceId: string) => void;

  /**
   * Resolve a {@link WorkspaceGitSummary} for the mount path. Returns
   * `null` when the path is not a git repo (or the host has not yet
   * produced a snapshot). Core treats the result as opaque mount
   * metadata; production of the summary (shelling out to git, parsing
   * worktree state, etc.) is a host concern — typically delegated to
   * a host-owned `GitService`. Called from `mountWorkspace` and from
   * `refreshWorkspaceInfo` whenever the watcher fires.
   */
  getWorkspaceGitSummary?: (
    workspacePath: string,
  ) => Promise<WorkspaceGitSummary | null> | WorkspaceGitSummary | null;
}
