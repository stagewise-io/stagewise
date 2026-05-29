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
}

/**
 * Telemetry used by agent lifecycle (names + loose payloads).
 * Browser `TelemetryService` satisfies this structurally.
 */
export interface AgentManagerTelemetryPort {
  readonly telemetryLevel: string;
  capture(event: string, props: Record<string, unknown>): void;
  captureException(
    error: Error,
    props: Record<string, unknown> | undefined,
  ): void;
}

/** Model registry lookups for default/resume model validation. */
export interface AgentManagerModelCatalogPort {
  modelExists(modelId: string): boolean;
}
