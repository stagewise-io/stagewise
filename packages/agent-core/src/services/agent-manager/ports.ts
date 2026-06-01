import type { MountPermission } from '../../types/metadata';

/**
 * Narrow toolbox surface consumed by the agent manager lifecycle.
 * `ToolboxService` in the browser satisfies this structurally.
 *
 * `getShellSnapshot` is optional — only some hosts wire shell telemetry.
 */
export interface AgentManagerToolboxPort {
  handleMountWorkspace(
    agentInstanceId: string,
    workspacePath: string,
    permissions?: MountPermission[],
  ): Promise<void>;
  cancelQuestion(
    agentInstanceId: string,
    questionId: string,
    reason: 'user_cancelled' | 'user_sent_message' | 'agent_stopped',
    draftAnswers?: Record<string, unknown>,
  ): void;
  getWorkspaceSnapshotForPersistence(agentInstanceId: string): Array<{
    path: string;
    permissions: MountPermission[];
  }>;
  setWorkspaceMdContent(workspacePath: string, content: string): void;
  acceptAllPendingEditsForAgent(agentInstanceId: string): Promise<void>;
  getEditedFilePathsForAgent(agentInstanceId: string): Promise<string[]>;
  getShellSnapshot?(agentInstanceId: string): unknown;
  /**
   * Optional host hook called from the `agents.create` handler to
   * normalize a user-supplied workspace path before mounting. Hosts
   * that wrap repositories with multiple worktrees typically remap
   * a linked-worktree path to the repository's main worktree so the
   * new agent's runtime / LSP starts at the canonical checkout.
   *
   * When omitted (or returning the input unchanged), `agents.create`
   * mounts the path verbatim. Callers can bypass remapping per-call
   * via the `preserveWorkspacePaths` argument on `agents.create`.
   */
  resolveNewAgentMountPath?(workspacePath: string): Promise<string>;
}
