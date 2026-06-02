import type { ToolUIPart, UIDataTypes, UIMessage, UITools } from 'ai';
import type {
  MountPermission,
  UserMessageMetadata,
  WorkspaceGitSummary,
} from './metadata';
import type { UniversalTools } from './tools';

export enum AgentTypes {
  CHAT = 'chat',
  WORKSPACE_MD = 'project-md',
}

export type AgentMessage<
  TTools extends UITools = UniversalTools,
  TMetadata = UserMessageMetadata,
> = UIMessage<TMetadata, UIDataTypes, TTools>;

export type AgentToolUIPart<TTools extends UITools = UniversalTools> =
  ToolUIPart<TTools>;

export type ExceededWindow = {
  type: string;
  resetsAt: string;
};

export type AgentRuntimeError =
  | { kind?: undefined; code?: number; message: string; stack?: string }
  | {
      kind: 'plan-limit-exceeded';
      message: string;
      plan?: string;
      exceededWindows: ExceededWindow[];
    }
  | {
      kind: 'upstream-overload';
      message: string;
      providerName?: string;
      statusCode?: number;
      modelId?: string;
    };

/**
 * Per-agent reasoning and chat runtime state.
 *
 * Persistence annotations classify each field as:
 * - `persisted-core`: stored on the agent row in
 *   `<userData>/stagewise/agents/instances.sqlite`; survives process
 *   restart and is re-hydrated by `resumeAgent`.
 * - `persisted-side`: stored in a separate table or file outside the core
 *   row.
 * - `ephemeral`: in-memory only; reset when the process restarts.
 * - `derived`: computed from other state and not stored.
 *
 * See `packages/agent-core/src/store/state-annotation.md` for the full
 * reference and per-field reset behavior on resume.
 */
export type AgentState<TMessage = AgentMessage> = {
  /** @persistence persisted-core — column `title`. */
  title: string;
  /** @persistence persisted-core — column `title_locked_by_user`. Nullable in DB, defaults to `false` semantically. */
  titleLockedByUser?: boolean;
  /** @persistence ephemeral — always reset to `false` on `resumeAgent` and set by the agent runloop. */
  isWorking: boolean;
  /**
   * @persistence persisted-core — stored on the `agentMessages` side-table
   * keyed by `agentInstanceId, seq` (one row per message) rather than the
   * legacy `history` JSON column on `agentInstances`. The column is kept
   * for rollback safety but is not the read source.
   */
  history: TMessage[];
  /** @persistence persisted-core — column `queued_messages` (JSON). */
  queuedMessages: (TMessage & { role: 'user' })[];
  /** @persistence persisted-core — column `active_model_id`. Validated against the provider registry on resume; falls back to the last-used chat model if invalid. */
  activeModelId: string;
  /**
   * Per-agent tool-approval preference.
   *
   * @persistence persisted-core — column `tool_approval_mode`. Store-
   * canonical since Phase 6; the host narrows the string union via
   * `ToolApprovalMode` in its `AgentState` overlay.
   *
   * @remarks D22 was previously "host-owned overlay"; Phase 6 promotes
   * the field into core so it rides on the generic recipe channel.
   */
  toolApprovalMode: string;
  /** @persistence ephemeral — reset to `{}` on resume; repopulated only while tool calls are awaiting approval. */
  pendingApprovals: Record<string, { explanation: string }>;
  /** @persistence persisted-core — column `input_state` (JSON). Preserves draft input across restart. */
  inputState: string;
  /** @persistence persisted-core — column `used_tokens`. Cumulative token counter. */
  usedTokens: number;
  /** @persistence ephemeral — reset on resume; set by the runloop on failure. */
  error?: AgentRuntimeError;
  /** @persistence ephemeral — reset on resume; maintained by the UI unread-marker logic. */
  unread?: boolean;
  /** @persistence ephemeral — reset on resume; populated by the model provider when a soft-limit window is approaching. */
  usageWarning?: {
    windowType: string;
    usedPercent: number;
    resetsAt: string;
  };
};

export type ToolboxState = {
  pendingFiles: string[];
};

export type AgentHistoryWorkspaceEntry = {
  path: string;
  permissions: MountPermission[];
  git: WorkspaceGitSummary | null;
};

export type AgentHistoryEntry = {
  id: string;
  title: string;
  createdAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  parentAgentInstanceId: string | null;
  mountedWorkspaces?: AgentHistoryWorkspaceEntry[] | null;
};

export type StoredAgentPreview<TAgentTypes extends AgentTypes = AgentTypes> = {
  id: string;
  type: TAgentTypes;
  title: string;
  createdAt: Date;
  lastMessageAt: Date;
  activeModelId: string;
  messageCount: number;
  mountedWorkspaces: Array<{
    path: string;
    permissions: MountPermission[];
    git: WorkspaceGitSummary | null;
  }> | null;
};
