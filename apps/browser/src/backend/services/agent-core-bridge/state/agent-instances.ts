import type {
  AgentInstanceWriterEnvelope,
  AgentInstanceState as CoreAgentInstanceState,
  AgentInstanceCommands as CoreAgentInstanceCommands,
  AgentStore,
  AgentSystemState,
} from '@stagewise/agent-core';
import type {
  AgentMessage,
  AgentState,
  AgentToolUIPart,
} from '@shared/karton-contracts/ui/agent';
import type { UserMessageMetadata } from '@shared/karton-contracts/ui/agent/metadata';
import type { UIAgentTools } from '@shared/karton-contracts/ui/agent/tools/types';
import type { ModelSettings } from '@shared/karton-contracts/ui/shared-types';
import type { DynamicToolUIPart } from 'ai';
import { clearPendingApproval } from '@stagewise/agent-core/agents';

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

/** Part states considered terminal by the stream-merge hot path. */
const SETTLED_PART_STATES = new Set([
  'output-available',
  'output-error',
  'output-denied',
  'done',
]);

/**
 * Union of terminal tool-part states used by Phase-7 tool-part
 * walkers (history sweeps, last-assistant sweeps).
 */
const TERMINAL_TOOL_STATES = new Set([
  'output-available',
  'output-error',
  'output-denied',
  'approval-responded',
]);

/**
 * Builds an {@link AgentInstancesStateController} backed by the given
 * {@link AgentStore}.
 *
 * All writes are wrapped in a single `store.update()` so subscribers
 * observe one post-recipe state per call (D18 transactional guarantee).
 *
 * The controller is host-specialized with {@link UIAgentTools},
 * {@link AgentMessage}, and the narrowed {@link AgentState}. The
 * underlying store keeps its package-level generics untouched; the
 * host shape is cast in at the write boundary because the host
 * {@link AgentState} is a structural subtype of the core
 * `AgentState<AgentMessage<UIAgentTools>>`.
 */
export function createAgentInstancesStateController(
  store: AgentStore,
): AgentInstancesStateController {
  /**
   * Internal helper: runs the mutator against the typed host state for
   * the requested agent. Defensive no-op when the id is unknown unless
   * `opts.throwOnMissing` is set (for commands whose original recipe
   * would have thrown on a missing entry).
   */
  function withState(
    agentInstanceId: string,
    mutate: (state: AgentState) => void,
    opts: { throwOnMissing?: boolean; source?: string } = {},
  ): void {
    store.update((draft) => {
      const systemDraft = draft as AgentSystemState;
      const entry = systemDraft.agents.instances[agentInstanceId];
      if (!entry) {
        if (opts.throwOnMissing) {
          throw new Error(
            `AgentInstancesStateController${opts.source ? `.${opts.source}` : ''}: unknown agent instance id '${agentInstanceId}'`,
          );
        }
        return;
      }
      // Runloop recipes are written against the host-narrowed
      // `AgentState` (branded `activeModelId`, `toolApprovalMode`
      // union, `UIAgentTools`). The core draft widens these back to
      // `string` / `UniversalTools`; the runtime shape is identical,
      // so we cross the boundary through `unknown`.
      mutate(entry.state as unknown as AgentState);
    });
  }

  return {
    upsertInstance(agentInstanceId, envelope) {
      store.update((draft) => {
        const systemDraft = draft as AgentSystemState;
        // Runtime shape matches {@link HostAgentInstanceState}; the
        // port uses the core envelope type for contravariance with
        // {@link AgentManager}.
        (systemDraft.agents.instances as Record<string, unknown>)[
          agentInstanceId
        ] = envelope as unknown as HostAgentInstanceState;
      });
    },

    deleteInstance(agentInstanceId) {
      store.update((draft) => {
        const systemDraft = draft as AgentSystemState;
        delete systemDraft.agents.instances[agentInstanceId];
        delete systemDraft.toolbox[agentInstanceId];
      });
    },

    setToolApprovalMode(agentInstanceId, mode) {
      store.update((draft) => {
        const systemDraft = draft as AgentSystemState;
        const entry = systemDraft.agents.instances[agentInstanceId];
        if (!entry) return;
        entry.state.toolApprovalMode = mode;
      });
    },

    setUnread(agentInstanceId, value) {
      store.update((draft) => {
        const systemDraft = draft as AgentSystemState;
        const entry = systemDraft.agents.instances[agentInstanceId];
        if (!entry) return;
        entry.state.unread = value;
      });
    },

    recordPendingApproval(agentInstanceId, toolCallId, explanation) {
      store.update((draft) => {
        const systemDraft = draft as AgentSystemState;
        const entry = systemDraft.agents.instances[agentInstanceId];
        if (!entry) return;
        entry.state.pendingApprovals[toolCallId] = { explanation };
      });
    },

    getInstance(agentInstanceId) {
      const entry = store.get().agents.instances[agentInstanceId];
      return entry as unknown as
        | AgentInstanceWriterEnvelope<
            UIAgentTools,
            UserMessageMetadata,
            AgentState
          >
        | undefined;
    },

    buildCommands(agentInstanceId): AgentInstanceCommands {
      return {
        hydrateInitialState({ defaultTitle, initialState, defaultModelId }) {
          withState(
            agentInstanceId,
            (state) => {
              state.title = initialState?.title ?? defaultTitle;
              // Preserve the user's manual-title lock across resumes.
              state.titleLockedByUser = initialState?.titleLockedByUser;
              state.history = initialState?.history ?? [];
              state.queuedMessages = initialState?.queuedMessages ?? [];
              state.activeModelId =
                initialState?.activeModelId ?? defaultModelId;
              // `state.toolApprovalMode` is always seeded by
              // `defaultState` in AgentManager.createAgent before this
              // command runs, so this fallback never yields undefined.
              state.toolApprovalMode =
                initialState?.toolApprovalMode ?? state.toolApprovalMode;
              state.pendingApprovals = initialState?.pendingApprovals ?? {};
              state.inputState = initialState?.inputState ?? state.inputState;
              state.usedTokens = initialState?.usedTokens ?? 0;
            },
            { source: 'hydrateInitialState' },
          );
        },

        setTitle({ title }) {
          withState(agentInstanceId, (state) => {
            state.title = title;
          });
        },

        setUserTitle({ title }) {
          withState(agentInstanceId, (state) => {
            state.title = title;
            state.titleLockedByUser = true;
          });
        },

        enqueueUserMessage({ message }) {
          let queuedModelId = 'unknown';
          let queueLengthAfter = 0;
          withState(agentInstanceId, (state) => {
            state.queuedMessages.push(message);
            queuedModelId = state.activeModelId ?? 'unknown';
            queueLengthAfter = state.queuedMessages.length;
          });
          return { queuedModelId, queueLengthAfter };
        },

        removeQueuedMessage({ messageId }) {
          withState(agentInstanceId, (state) => {
            state.queuedMessages = state.queuedMessages.filter(
              (m) => m.id !== messageId,
            );
          });
        },

        clearQueuedMessages() {
          withState(agentInstanceId, (state) => {
            state.queuedMessages = [];
          });
        },

        flushQueueIntoHistory() {
          withState(agentInstanceId, (state) => {
            state.history.push(...state.queuedMessages);
            state.queuedMessages = [];
          });
        },

        denyAllNonTerminalToolPartsInHistory({
          approvalDenyReason,
          forceErrorText,
        }) {
          withState(agentInstanceId, (state) => {
            for (const historyMsg of state.history) {
              if (historyMsg.role !== 'assistant') continue;
              for (let i = 0; i < historyMsg.parts.length; i++) {
                const p = historyMsg.parts[i]!;
                if (!(p.type.startsWith('tool-') || p.type === 'dynamic-tool'))
                  continue;
                const toolPart = p as AgentToolUIPart | DynamicToolUIPart;
                if (TERMINAL_TOOL_STATES.has(toolPart.state)) continue;

                // Keep `pendingApprovals` free of stale entries
                // regardless of which terminal state we transition to.
                clearPendingApproval(
                  state.pendingApprovals,
                  toolPart.toolCallId,
                );

                if (toolPart.state === 'approval-requested') {
                  const updatedToolPart: AgentToolUIPart | DynamicToolUIPart = {
                    ...toolPart,
                    state: 'output-denied' as const,
                    approval: {
                      ...toolPart.approval!,
                      approved: false,
                      reason: approvalDenyReason,
                    },
                  } as AgentToolUIPart | DynamicToolUIPart;
                  historyMsg.parts[i] = updatedToolPart;
                } else {
                  // Force-terminate stale non-terminal states.
                  // @ts-expect-error - input may be partial
                  const updatedToolPart: AgentToolUIPart | DynamicToolUIPart = {
                    ...toolPart,
                    state: 'output-error',
                    input: toolPart.input ?? {},
                    approval: undefined,
                    errorText: forceErrorText,
                  };
                  historyMsg.parts[i] = updatedToolPart;
                }
              }
            }
          });
        },

        terminateNonTerminalToolPartsInLastAssistant({
          approvalDenyReason,
          outputErrorText,
        }) {
          withState(agentInstanceId, (state) => {
            const lastMsg = state.history[state.history.length - 1];
            if (lastMsg?.role !== 'assistant') return;

            lastMsg.parts.forEach((p, index) => {
              if (p.type === 'dynamic-tool' || p.type.startsWith('tool-')) {
                const toolPart = p as AgentToolUIPart | DynamicToolUIPart;
                if (toolPart.state === 'approval-requested') {
                  clearPendingApproval(
                    state.pendingApprovals,
                    toolPart.toolCallId,
                  );
                  const updatedToolPart: AgentToolUIPart | DynamicToolUIPart = {
                    ...toolPart,
                    state: 'output-denied',
                    approval: {
                      ...toolPart.approval,
                      approved: false,
                      reason: approvalDenyReason,
                    },
                  };
                  lastMsg.parts[index] = updatedToolPart;
                } else if (
                  toolPart.state !== 'output-available' &&
                  toolPart.state !== 'output-error'
                ) {
                  // @ts-expect-error - input may be partial
                  const updatedToolPart: AgentToolUIPart | DynamicToolUIPart = {
                    ...toolPart,
                    state: 'output-error',
                    input: toolPart.input ?? {},
                    approval: undefined,
                    errorText: outputErrorText,
                  };
                  lastMsg.parts[index] = updatedToolPart;
                }
              }
            });

            // Strip trailing reasoning parts (providers reject them).
            while (
              lastMsg.parts.length > 0 &&
              lastMsg.parts[lastMsg.parts.length - 1]!.type === 'reasoning'
            ) {
              lastMsg.parts.pop();
              lastMsg.metadata?.partsMetadata?.pop();
            }

            // If empty (only reasoning), drop the message.
            if (lastMsg.parts.length === 0) {
              state.history.pop();
            }
          });
        },

        resolveApproval({ approvalId, approved, reason }) {
          withState(agentInstanceId, (state) => {
            for (let i = state.history.length - 1; i >= 0; i--) {
              const msg = state.history[i]!;
              if (msg.role !== 'assistant') continue;
              const toolPartIndex = msg.parts.findIndex(
                (part) =>
                  (part.type.startsWith('tool-') ||
                    part.type === 'dynamic-tool') &&
                  (part as AgentToolUIPart | DynamicToolUIPart).approval?.id ===
                    approvalId,
              );
              if (toolPartIndex !== -1) {
                const part = msg.parts[toolPartIndex] as
                  | AgentToolUIPart
                  | DynamicToolUIPart;
                // Always clear any stashed classifier explanation.
                clearPendingApproval(state.pendingApprovals, part.toolCallId);
                if (part.state === 'approval-requested') {
                  const updatedToolPart = {
                    ...part,
                    state: 'approval-responded',
                    approval: {
                      ...part.approval,
                      approved,
                      reason,
                    },
                  };
                  // @ts-expect-error - ToolUIPart shape preserved
                  msg.parts[toolPartIndex] = updatedToolPart;
                }
                break;
              }
            }
          });
        },

        appendHistoryMessage({ message }) {
          withState(agentInstanceId, (state) => {
            state.history.push(message);
          });
        },

        truncateHistoryAt({ messageIndex }) {
          withState(agentInstanceId, (state) => {
            state.history = state.history.slice(0, messageIndex);
            state.queuedMessages = [];
          });
        },

        replaceUserMessage({ userMessageId }) {
          withState(agentInstanceId, (state) => {
            const replaceMessageIndex = state.history.findIndex(
              (m) => m.id === userMessageId,
            );
            if (replaceMessageIndex === -1) {
              throw new Error('User message not found in history');
            }
            state.history = state.history.slice(0, replaceMessageIndex);
            state.queuedMessages = [];
          });
        },

        setInputState({ inputState }) {
          withState(agentInstanceId, (state) => {
            state.inputState = inputState;
          });
        },

        setActiveModel({ modelId }) {
          withState(agentInstanceId, (state) => {
            state.activeModelId = modelId;
          });
        },

        setIsWorkingFalse() {
          withState(agentInstanceId, (state) => {
            state.isWorking = false;
          });
        },

        beginStep({ flushQueue }) {
          let queueFlushIndex: number | undefined;
          withState(agentInstanceId, (state) => {
            state.isWorking = true;
            state.error = undefined;
            if (flushQueue && state.queuedMessages.length > 0) {
              queueFlushIndex = state.history.length;
              state.history.push(...state.queuedMessages);
              state.queuedMessages = [];
            }
          });
          return { queueFlushIndex };
        },

        recordStepError({ error, markUnread }) {
          withState(agentInstanceId, (state) => {
            state.isWorking = false;
            if (error !== undefined) {
              state.error = error;
            }
            if (markUnread === 'mark-unread') {
              state.unread = true;
            } else if (markUnread === 'if-assistant-history') {
              if (state.history.some((m) => m.role === 'assistant')) {
                state.unread = true;
              }
            }
            // 'always' → no unread write
          });
        },

        recordUsage({ totalTokens }) {
          withState(agentInstanceId, (state) => {
            state.usedTokens = totalTokens;
          });
        },

        attachAttachmentsToLastAssistant({ attachments }) {
          withState(agentInstanceId, (state) => {
            const last = state.history[state.history.length - 1];
            if (last?.role === 'assistant') {
              last.metadata ??= { createdAt: new Date(), partsMetadata: [] };
              last.metadata.attachments = [
                ...(last.metadata.attachments ?? []),
                ...attachments,
              ];
            }
          });
        },

        attachEnvState({ entries, queueFlushStart }) {
          if (entries.size === 0) return;
          withState(agentInstanceId, (state) => {
            const targetIdx =
              queueFlushStart !== undefined &&
              queueFlushStart < state.history.length
                ? queueFlushStart
                : state.history.length - 1;
            const target = state.history[targetIdx];
            if (!target) return;

            target.metadata ??= {
              createdAt: new Date(),
              partsMetadata: [],
            };
            const envState: NonNullable<
              NonNullable<typeof target.metadata>['envState']
            > = {
              ...(target.metadata.envState ?? {}),
            };
            for (const [domainId, entry] of entries) {
              envState[domainId] = entry;
            }
            target.metadata.envState = envState;
          });
        },

        setUserPathReferences({ populated }) {
          withState(agentInstanceId, (state) => {
            for (const { idx, pathReferences } of populated) {
              const target = state.history[idx];
              if (!target) continue;
              target.metadata ??= {
                createdAt: new Date(),
                partsMetadata: [],
              };
              target.metadata.pathReferences = pathReferences;
            }
          });
        },

        mergeAssistantPathReferences({ targetIdx, references }) {
          withState(agentInstanceId, (state) => {
            const target = state.history[targetIdx];
            if (!target || target.role !== 'assistant') return;
            target.metadata ??= {
              createdAt: new Date(),
              partsMetadata: [],
            };
            target.metadata.pathReferences = {
              ...(target.metadata.pathReferences ?? {}),
              ...references,
            };
          });
        },

        mergeUIMessageStream({ uiMessage, onApprovalRequested }) {
          withState(agentInstanceId, (state) => {
            const existingMessage =
              state.history.find((message) => message.id === uiMessage.id) ??
              (() => {
                state.history.push(uiMessage);
                return state.history[state.history.length - 1]!;
              })();

            // Fine-grained merge: only touch parts that are still
            // actively changing so Immer produces small, targeted
            // patches and settled part references survive all the way
            // to React (SinglePartRenderer relies on reference equality
            // for memoisation).
            //
            // Contract: once a part reaches a settled state, its
            // content (type, input, output) is considered final and
            // will not be re-emitted with different values by the AI
            // SDK stream. If this assumption is violated, the stale
            // part will persist until a non-settled state change
            // forces an update.
            const incoming = uiMessage.parts;
            const existing = existingMessage.parts;
            for (let i = 0; i < incoming.length; i++) {
              if (i >= existing.length) {
                existing.push(incoming[i]!);
              } else {
                const ep = existing[i] as Record<string, unknown>;
                const ip = incoming[i] as Record<string, unknown>;
                if (
                  ep.type === ip.type &&
                  ep.state === ip.state &&
                  SETTLED_PART_STATES.has(ep.state as string)
                )
                  continue;
                existing[i] = incoming[i]!;
              }
            }
            if (existing.length > incoming.length)
              existing.length = incoming.length;

            existingMessage.metadata ??= {
              createdAt: new Date(),
              partsMetadata: [],
            };

            uiMessage.parts.forEach(
              (part: (typeof uiMessage.parts)[number], index: number) => {
                if (part.type === 'text' || part.type === 'reasoning') {
                  existingMessage.metadata!.partsMetadata[index] ??= {
                    startedAt: new Date(),
                    endedAt: undefined,
                  };
                  if (part.state === 'done') {
                    existingMessage.metadata!.partsMetadata[index]!.endedAt ??=
                      new Date();
                  }
                }

                if (
                  (part.type === 'dynamic-tool' ||
                    part.type.startsWith('tool-')) &&
                  (part as AgentToolUIPart | DynamicToolUIPart).state ===
                    'approval-requested'
                ) {
                  const toolPart = part as AgentToolUIPart | DynamicToolUIPart;
                  const approvalId = toolPart.approval?.id;
                  if (approvalId && onApprovalRequested) {
                    onApprovalRequested({ approvalId, toolPart });
                  }
                }
              },
            );
          });
        },

        storeCompressedHistory({ boundaryMessageId, compressedHistory }) {
          let result: 'missing' | 'written' = 'missing';
          withState(agentInstanceId, (state) => {
            const boundaryMessage = state.history.find(
              (m) => m.id === boundaryMessageId,
            );
            if (!boundaryMessage) return;
            boundaryMessage.metadata ??= {
              createdAt: new Date(),
              partsMetadata: [],
            };
            boundaryMessage.metadata.compressedHistory = compressedHistory;
            result = 'written';
          });
          return result;
        },

        setUsageWarning({ warning }) {
          withState(agentInstanceId, (state) => {
            state.usageWarning = warning;
          });
        },

        setAssistantOwnedReasoningDetails({
          targetIdx,
          ownedReasoningDetails,
        }) {
          withState(agentInstanceId, (state) => {
            const target = state.history[targetIdx];
            if (!target || target.role !== 'assistant') return;
            target.metadata ??= {
              createdAt: new Date(),
              partsMetadata: [],
            };
            target.metadata.ownedReasoningDetails = ownedReasoningDetails;
          });
        },
      };
    },
  };
}
