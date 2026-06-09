import type {
  AgentHistoryEntry,
  AgentHistoryWorkspaceEntry,
  AgentMessage as CoreAgentMessage,
  AgentRuntimeError,
  AgentState as CoreAgentState,
  CreateExternalCliAgentInput,
  ExternalCliAgentAvailability,
  ExternalCliAgentInstanceConfig,
  ExternalCliAgentKind,
  ExternalCliAgentRuntimeState,
  ExternalCliAgentStatus,
  AgentToolUIPart as CoreAgentToolUIPart,
  AgentTypes,
  ExceededWindow,
  StoredAgentPreview as CoreStoredAgentPreview,
  ToolboxState,
  WorkspaceActionPayloadLike as CoreWorkspaceActionPayloadLike,
} from '@stagewise/agent-core/types/agent';
import { AgentTypes as CoreAgentTypes } from '@stagewise/agent-core/types/agent';
import type { ModelId } from '@shared/available-models';
import type { MountedWorkspaceGitSummary } from '..';
import type {
  ToolApprovalMode,
  WorkspaceGitAction,
} from '@shared/karton-contracts/ui/shared-types';
import type { MountPermission, UserMessageMetadata } from './metadata';
import type { UIAgentTools } from './tools/types';

export { CoreAgentTypes as AgentTypes };
export type {
  AgentHistoryEntry,
  AgentHistoryWorkspaceEntry,
  AgentRuntimeError,
  CreateExternalCliAgentInput,
  ExceededWindow,
  ExternalCliAgentAvailability,
  ExternalCliAgentInstanceConfig,
  ExternalCliAgentKind,
  ExternalCliAgentRuntimeState,
  ExternalCliAgentStatus,
  ToolboxState,
};

export type WorkspaceActionPayloadLike = Omit<
  CoreWorkspaceActionPayloadLike,
  'action'
> & {
  action: WorkspaceGitAction;
};

export type AgentMessage = CoreAgentMessage<UIAgentTools, UserMessageMetadata>;

export type AgentToolUIPart = CoreAgentToolUIPart<UIAgentTools>;

export type AgentState = Omit<
  CoreAgentState<AgentMessage>,
  'activeModelId' | 'toolApprovalMode'
> & {
  activeModelId: ModelId;
  /**
   * Tool approval preference persisted per agent row.
   *
   * Since Phase 6, this field is store-canonical on `AgentState` in
   * `@stagewise/agent-core` as `toolApprovalMode: string`. The host
   * narrows it to the `ToolApprovalMode` union so UI, telemetry, and
   * persistence can rely on the closed set of values.
   *
   * @see `packages/agent-core/SPEC.md` D22 (superseded by Phase 6).
   */
  toolApprovalMode: ToolApprovalMode;
};

/**
 * Trimmed preview DTO for a persisted agent instance, returned on-demand by
 * `agents.getStoredInstance` for the sidebar preview panel. Derived from the
 * core preview shape, narrowing `activeModelId` to the host `ModelId` union
 * and `mountedWorkspaces` to the host git-summary alias.
 */
export type StoredAgentPreview = Omit<
  CoreStoredAgentPreview<AgentTypes>,
  'activeModelId' | 'mountedWorkspaces'
> & {
  activeModelId: ModelId;
  mountedWorkspaces: Array<{
    path: string;
    permissions: MountPermission[];
    git: MountedWorkspaceGitSummary | null;
  }> | null;
};
