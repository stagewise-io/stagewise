import type { UITools } from 'ai';
import type { AgentMessage, AgentState, AgentTypes } from '../types/agent';
import type { FileDiff } from '../types/diff-history';
import type { AttachmentMetadata, MountEntry } from '../types/metadata';
import type { UniversalTools } from '../types/tools';

/**
 * A single entry from the live shell session manifest that the host streams
 * to the agent via the `shells` toolbox slice.
 *
 * Structurally mirrors `ShellSessionSnapshot` in
 * `apps/browser/src/shared/karton-contracts/ui/agent/metadata.ts`.
 * We intentionally duplicate the shape here to keep the agent-core package
 * free of host-side imports. The Karton bridge maps between the two
 * structurally-identical types at the boundary.
 */
export type ShellSessionSummary = {
  id: string;
  exited: boolean;
  exitCode: number | null;
  lineCount: number;
  logPath: string;
  tailContent?: string;
  lastLine?: string;
  cwd: string;
  createdAt: number;
};

/**
 * Model-capability flags that agents require for model selection.
 *
 * Structurally mirrors `ModelSettings['capabilities']` in
 * `apps/browser/src/shared/karton-contracts/ui/shared-types.ts`. We keep this
 * here as an opaque record rather than re-exporting from the host, because
 * the set of capability flags is host-defined and may evolve independently
 * of the agent-core package.
 */
export type RequiredModelCapabilities = Record<string, boolean | undefined>;

/**
 * A pending question dispatched by the `askUserQuestions` tool. The field
 * and answer shapes are generic because both are defined by the host-owned
 * tool schema (`apps/browser/src/shared/karton-contracts/ui/agent/tools/types.ts`).
 * The host specializes this type when bridging to Karton.
 */
export type PendingUserQuestion<TField = unknown, TAnswer = unknown> = {
  id: string;
  title: string;
  description?: string;
  steps: Array<{
    title?: string;
    description?: string;
    fields: TField[];
  }>;
  currentStep: number;
  answers: Record<string, TAnswer>;
};

/**
 * Per-agent runtime envelope. Mirrors `AppState.agents.instances[agentId]`
 * in the Karton contract.
 *
 * Persistence annotations below classify each field as:
 * - `persisted-core`: stored on the agent row in
 *   `<userData>/stagewise/agents/instances.sqlite` (`agentInstances` table);
 *   survives process restart.
 * - `persisted-side`: stored in a separate side table (diff-history DB,
 *   attachment blobs, etc.); survives restart but is sourced via a
 *   dedicated service on resume, not the core agent row.
 * - `ephemeral`: in-memory only; reset when the process restarts or when
 *   `resumeAgent` re-hydrates the instance.
 * - `derived`: computed from other persisted state (typically from `type`
 *   via `AgentsMap[type].config`) and not stored directly.
 *
 * See `state-annotation.md` in this directory for the full reference.
 */
export type AgentInstanceState<TTools extends UITools = UniversalTools> = {
  /** @persistence persisted-core — column `type` in `agentInstances`. */
  type: AgentTypes;
  /** @persistence derived — from `AgentsMap[type].config.allowModelSelection`. */
  canSelectModel: boolean;
  /** @persistence derived — from `AgentsMap[type].config.requiredCapabilities`. */
  requiredModelCapabilities: RequiredModelCapabilities;
  /** @persistence derived — from `AgentsMap[type].config.allowUserInput`. */
  allowUserInput: boolean;
  /** @persistence persisted-core — column `parent_agent_instance_id`; used to rebuild the parent/child tree on boot (D13). */
  parentAgentInstanceId: string | null;
  /** @persistence mixed — see field-level tags on `AgentState` below. */
  state: AgentState<AgentMessage<TTools>>;
};

/**
 * Per-agent host-side toolbox slice. Mirrors `AppState.toolbox[agentId]`
 * in the Karton contract.
 *
 * The toolbox is, as of Phase 1, entirely *host-projected* state: the host
 * populates it as a side effect of services (diff-history, mount-manager,
 * toolbox command handlers, sandbox/shell runners) and the agent reads from
 * it indirectly via those services. None of its fields are stored in the
 * agent row. Fields that survive restart do so because the underlying
 * service re-derives them from its own side table.
 */
export type ToolboxAgentState<
  TQuestionField = unknown,
  TQuestionAnswer = unknown,
> = {
  workspace: {
    /**
     * @persistence persisted-core — remounted on resume from the
     * `mounted_workspaces` column on `agentInstances` via
     * `MountManagerService.handleMountWorkspace`. Repopulated into the
     * toolbox slice as a side effect of the remount.
     */
    mounts: MountEntry[];
  };
  /**
   * @persistence persisted-side — derived on load from the diff-history DB
   * (`<userData>/stagewise/diff-history/data.sqlite`) by
   * `DiffHistoryService`. The blob contents live in the `snapshots` table
   * and on-disk blobs.
   */
  pendingFileDiffs: FileDiff[];
  /**
   * @persistence persisted-side — same source as `pendingFileDiffs`;
   * represents accepted-but-still-relevant diffs.
   */
  editSummary: FileDiff[];
  /** @persistence ephemeral — cleared on resume; recreated only while a tool call is live. */
  pendingUserQuestion: PendingUserQuestion<
    TQuestionField,
    TQuestionAnswer
  > | null;
  /** @persistence ephemeral — sandbox output buffers are live process state only. */
  pendingSandboxOutputs?: Record<string, string[]>;
  /** @persistence ephemeral — attachments captured during a live sandbox run; cleared on resume. */
  pendingSandboxAttachments?: Record<string, AttachmentMetadata[]>;
  /** @persistence ephemeral — shell tail buffers, cleared on resume. */
  pendingShellOutputs?: Record<string, string[]>;
  /**
   * Maps toolCallId → sessionId for in-flight shell commands.
   * @persistence ephemeral — sessions do not survive restart.
   */
  pendingShellSessionIds?: Record<string, string>;
  /**
   * Live shell session manifest — pushed eagerly on lifecycle events.
   * @persistence ephemeral — rebuilt from the host shell service on boot.
   */
  shells?: { sessions: ShellSessionSummary[] };
  /**
   * @persistence ephemeral — present only while a mini-app is open in-process.
   */
  activeApp?: {
    appId: string;
    pluginId?: string;
    src: string;
    height?: number;
  } | null;
  /**
   * @persistence ephemeral — one-shot message bus entry between the agent
   * and an active mini-app; cleared on resume or on forward.
   */
  pendingAppMessage?: {
    appId: string;
    pluginId?: string;
    data: unknown;
  } | null;
};

/**
 * Canonical in-memory agent system state owned by `AgentStore`.
 *
 * Shape is a 1:1 mirror of the `agents` + `toolbox` slices of
 * `AppState` in the Karton contract. The `KartonBridge` projects this
 * state onto Karton verbatim; all other surfaces (CLI, ACP, remote Split-
 * Brain) read the same canonical shape directly from the store.
 *
 * See `state-annotation.md` for:
 * - a field-by-field parity table against `AppState.agents` and
 *   `AppState.toolbox`;
 * - the persistence map for every field;
 * - the three documented intentional deltas (D14/D22);
 * - child-agent invariants (D13).
 */
export type AgentSystemState<
  TTools extends UITools = UniversalTools,
  TQuestionField = unknown,
  TQuestionAnswer = unknown,
> = {
  agents: {
    instances: {
      [agentInstanceId: string]: AgentInstanceState<TTools>;
    };
  };
  toolbox: {
    [agentInstanceId: string]: ToolboxAgentState<
      TQuestionField,
      TQuestionAnswer
    >;
  };
};
