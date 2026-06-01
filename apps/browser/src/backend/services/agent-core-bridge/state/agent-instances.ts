import {
  createInMemoryAgentInstancesWriter,
  type AgentInstanceWriterEnvelope,
  type AgentInstanceState as CoreAgentInstanceState,
  type AgentInstanceCommands as CoreAgentInstanceCommands,
  type AgentStore,
  type AgentSystemState,
} from '@stagewise/agent-core';
import type { AgentState } from '@shared/karton-contracts/ui/agent';
import type { UserMessageMetadata } from '@shared/karton-contracts/ui/agent/metadata';
import type { UIAgentTools } from '@shared/karton-contracts/ui/agent/tools/types';
import type { ModelSettings } from '@shared/karton-contracts/ui/shared-types';

/**
 * Host-specialized envelope shape written to the store.
 *
 * The core `AgentInstanceState<UIAgentTools>` specializes the `state`
 * field to `AgentState<AgentMessage<UIAgentTools>>`, whose
 * `activeModelId` / `toolApprovalMode` stay `string`. The host's
 * {@link AgentState} narrows both to branded union types (D14 / D22).
 * We re-type `state` here so the narrowed unions remain visible at the
 * controller surface; the underlying store still type-checks because
 * the host state is a subtype of the core state.
 */
export type HostAgentInstanceState = Omit<
  CoreAgentInstanceState<UIAgentTools>,
  'state' | 'requiredModelCapabilities'
> & {
  state: AgentState;
  /**
   * Host-narrowed: Karton's `AppState.agents.instances[id]` carries
   * structured modality capabilities, while the core store type widens
   * to `Record<string, boolean | undefined>`. The runtime shape is
   * identical; writers always build the envelope from the structured
   * host source of truth.
   */
  requiredModelCapabilities: ModelSettings['capabilities'];
};

/**
 * Host specialization of {@link CoreAgentInstanceCommands}.
 *
 * The full Phase 7 contract lives in
 * `@stagewise/agent-core/types/agent-commands`. The host parameterizes
 * the generic with its narrowed `AgentMessage` (which carries
 * `UserMessageMetadata`) and the union-typed `AgentState` so command
 * arguments and return-types match every existing call site.
 */
export type AgentInstanceCommands = CoreAgentInstanceCommands<
  UIAgentTools,
  UserMessageMetadata,
  AgentState
>;

/**
 * Host surface that owns the migrated `agents.instances` slice.
 *
 * Phase 6 moves canonical ownership of every field on
 * `agents.instances[agentId]` from Karton to `AgentStore`. Every
 * previous `karton.setState(draft => draft.agents.instances...)` call
 * site routes through a method on this controller instead. The
 * `AgentCoreBridge` mirrors the rebuilt envelope back into Karton for
 * every existing reader.
 *
 * Phase 7 narrows the former `applyStateRecipe` escape hatch into a
 * typed per-intent surface. See {@link AgentInstanceCommands} and
 * {@link buildCommands}.
 *
 * Contract notes:
 *   - Writes are whole-envelope replacement on upsert. The bridge
 *     forward-mirror dedups on reference identity at the
 *     `agents.instances[id]` level — Immer allocates a fresh envelope
 *     on any mutation, so writers never need to diff sub-fields.
 *   - `deleteInstance` removes both `agents.instances[id]` and
 *     `toolbox[id]` in a single `store.update()` call, matching the
 *     existing paired delete pattern in `AgentManager.archiveAgent`.
 *   - Missing agent ids: per-command methods are defensive no-ops
 *     except where the original recipe explicitly threw (noted on the
 *     relevant command). Field-level setters
 *     ({@link setToolApprovalMode}, {@link setUnread},
 *     {@link recordPendingApproval}) stay as defensive no-ops so late
 *     writes from outlived subscribers do not crash the process.
 */
export interface AgentInstancesStateController {
  /**
   * Creates or replaces an agent envelope. Wraps one `store.update()`.
   *
   * Callers MUST always allocate a fresh envelope object for every
   * write — the bridge forward-mirror dedups on reference identity and
   * will silently drop mutations that reuse the previous reference.
   */
  upsertInstance(
    agentInstanceId: string,
    envelope: AgentInstanceWriterEnvelope<
      UIAgentTools,
      UserMessageMetadata,
      AgentState
    >,
  ): void;

  /**
   * Removes `agents.instances[id]` AND `toolbox[id]` atomically.
   *
   * Idempotent: no-op if the agent id is not present. Matches the
   * existing paired delete pattern in `AgentManager.archiveAgent`.
   */
  deleteInstance(agentInstanceId: string): void;

  /**
   * Field-level write for the `agents.setToolApprovalMode` procedure
   * path. No-op if the agent id is not present.
   */
  setToolApprovalMode(
    agentInstanceId: string,
    mode: AgentState['toolApprovalMode'],
  ): void;

  /**
   * Field-level write for the `agents.markAsRead` procedure and for
   * the unread-on-question side effect in the `askUserQuestions`
   * tool. No-op if the agent id is not present.
   */
  setUnread(agentInstanceId: string, value: boolean): void;

  /**
   * Field-level write for `ToolboxService.recordPendingApproval`.
   * No-op if the agent id is not present.
   */
  recordPendingApproval(
    agentInstanceId: string,
    toolCallId: string,
    explanation: string,
  ): void;

  /**
   * Returns an {@link AgentInstanceCommands} bundle whose methods are
   * pre-bound to `agentInstanceId`. Each method wraps a single
   * `store.update()` and performs the narrowed equivalent of a former
   * `BaseAgent.state.set` recipe. Phase 7 contract: this is the
   * single write channel the runloop uses; no opaque recipe function
   * crosses the seam.
   */
  buildCommands(agentInstanceId: string): AgentInstanceCommands;

  /**
   * Read-only peek for services that want to observe their own writes
   * or read the canonical envelope without going through Karton.
   */
  getInstance(
    agentInstanceId: string,
  ):
    | AgentInstanceWriterEnvelope<UIAgentTools, UserMessageMetadata, AgentState>
    | undefined;
}

/**
 * Builds an {@link AgentInstancesStateController} backed by the given
 * {@link AgentStore}.
 *
 * The CRUD + per-intent command surface is delegated to the core
 * `createInMemoryAgentInstancesWriter` (single source of truth for the
 * D18 one-`store.update`-per-intent transactional guarantee). The
 * host-specific setters ({@link AgentInstancesStateController.setUnread}
 * and {@link AgentInstancesStateController.recordPendingApproval}) are
 * implemented inline because they back browser-only call sites
 * (`agents.markAsRead`, `askUserQuestions`, smart-approval metadata)
 * that are outside the core writer contract.
 *
 * The controller is host-specialized with {@link UIAgentTools},
 * {@link UserMessageMetadata}, and the narrowed {@link AgentState}.
 * The host state is a structural subtype of the core
 * `AgentState<AgentMessage<UIAgentTools>>`, so the composed object is
 * cast at the controller boundary.
 */
export function createAgentInstancesStateController(
  store: AgentStore,
): AgentInstancesStateController {
  const base = createInMemoryAgentInstancesWriter<
    UIAgentTools,
    UserMessageMetadata,
    AgentState
  >({ store });

  return {
    ...base,
    setUnread(agentInstanceId: string, value: boolean) {
      store.update((draft) => {
        const systemDraft = draft as AgentSystemState;
        const entry = systemDraft.agents.instances[agentInstanceId];
        if (!entry) return;
        entry.state.unread = value;
      });
    },
    recordPendingApproval(
      agentInstanceId: string,
      toolCallId: string,
      explanation: string,
    ) {
      store.update((draft) => {
        const systemDraft = draft as AgentSystemState;
        const entry = systemDraft.agents.instances[agentInstanceId];
        if (!entry) return;
        entry.state.pendingApprovals[toolCallId] = { explanation };
      });
    },
  } as unknown as AgentInstancesStateController;
}
