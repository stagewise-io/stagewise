import type { DynamicToolUIPart, UITools } from 'ai';
import { clearPendingApproval } from '../../agents';
import type { AgentStore } from '../../store/agent-store';
import type { AgentSystemState } from '../../store/state';
import type { AgentInstanceCommands } from '../../types/agent-commands';
import type {
  AgentMessage,
  AgentState,
  AgentToolUIPart,
} from '../../types/agent';
import type { UserMessageMetadata as MetaWritable } from '../../types/metadata';
import type { UniversalTools } from '../../types/tools';
import type {
  AgentInstancesWriterPort,
  AgentInstanceWriterEnvelope,
} from './agent-instances-writer-port';

/** Part states considered terminal by the stream-merge hot path. */
const SETTLED_PART_STATES = new Set([
  'output-available',
  'output-error',
  'output-denied',
  'done',
]);

const TERMINAL_TOOL_STATES = new Set([
  'output-available',
  'output-error',
  'output-denied',
  'approval-responded',
]);

/**
 * In-memory {@link AgentInstancesWriterPort} backed by {@link AgentStore}.
 * Same transactional semantics as the browser controller (one
 * `store.update()` per command) without Karton forward-mirroring.
 */
export function createInMemoryAgentInstancesWriter<
  TUITools extends UITools = UniversalTools,
  TMessageMetadata = MetaWritable,
  TState extends AgentState<
    AgentMessage<TUITools, TMessageMetadata>
  > = AgentState<AgentMessage<TUITools, TMessageMetadata>>,
>(deps: {
  store: AgentStore;
}): AgentInstancesWriterPort<TUITools, TMessageMetadata, TState> {
  const { store } = deps;

  function withState(
    agentInstanceId: string,
    mutate: (state: TState) => void,
    opts: { throwOnMissing?: boolean; source?: string } = {},
  ): void {
    store.update((draft) => {
      const systemDraft = draft as AgentSystemState;
      const entry = systemDraft.agents.instances[agentInstanceId];
      if (!entry) {
        if (opts.throwOnMissing) {
          throw new Error(
            `InMemoryAgentInstancesWriter${opts.source ? `.${opts.source}` : ''}: unknown agent instance id '${agentInstanceId}'`,
          );
        }
        return;
      }
      mutate(entry.state as unknown as TState);
    });
  }

  return {
    upsertInstance(agentInstanceId, envelope) {
      store.update((draft) => {
        const systemDraft = draft as AgentSystemState;
        (systemDraft.agents.instances as Record<string, unknown>)[
          agentInstanceId
        ] = envelope;
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
        entry.state.toolApprovalMode = mode as string;
      });
    },

    getInstance(agentInstanceId) {
      const entry = store.get().agents.instances[agentInstanceId];
      return entry as
        | AgentInstanceWriterEnvelope<TUITools, TMessageMetadata, TState>
        | undefined;
    },

    buildCommands(
      agentInstanceId,
    ): AgentInstanceCommands<TUITools, TMessageMetadata, TState> {
      return {
        hydrateInitialState({ defaultTitle, initialState, defaultModelId }) {
          withState(
            agentInstanceId,
            (state) => {
              state.title = initialState?.title ?? defaultTitle;
              state.titleLockedByUser = initialState?.titleLockedByUser;
              state.history = initialState?.history ?? [];
              state.queuedMessages = initialState?.queuedMessages ?? [];
              state.activeModelId =
                initialState?.activeModelId ?? defaultModelId;
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
                const toolPart = p as
                  | AgentToolUIPart<TUITools>
                  | DynamicToolUIPart;
                if (TERMINAL_TOOL_STATES.has(toolPart.state)) continue;

                clearPendingApproval(
                  state.pendingApprovals,
                  toolPart.toolCallId,
                );

                if (toolPart.state === 'approval-requested') {
                  const updatedToolPart:
                    | AgentToolUIPart<TUITools>
                    | DynamicToolUIPart = {
                    ...toolPart,
                    state: 'output-denied' as const,
                    approval: {
                      ...toolPart.approval!,
                      approved: false,
                      reason: approvalDenyReason,
                    },
                  } as AgentToolUIPart<TUITools> | DynamicToolUIPart;
                  historyMsg.parts[i] =
                    updatedToolPart as unknown as (typeof historyMsg.parts)[number];
                } else {
                  const updatedToolPart:
                    | AgentToolUIPart<TUITools>
                    | DynamicToolUIPart = {
                    ...toolPart,
                    state: 'output-error',
                    input: toolPart.input ?? {},
                    approval: undefined,
                    errorText: forceErrorText,
                  } as AgentToolUIPart<TUITools> | DynamicToolUIPart;
                  historyMsg.parts[i] =
                    updatedToolPart as unknown as (typeof historyMsg.parts)[number];
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
                const toolPart = p as
                  | AgentToolUIPart<TUITools>
                  | DynamicToolUIPart;
                if (toolPart.state === 'approval-requested') {
                  clearPendingApproval(
                    state.pendingApprovals,
                    toolPart.toolCallId,
                  );
                  const updatedToolPart:
                    | AgentToolUIPart<TUITools>
                    | DynamicToolUIPart = {
                    ...toolPart,
                    state: 'output-denied',
                    approval: {
                      ...toolPart.approval!,
                      approved: false,
                      reason: approvalDenyReason,
                    },
                  } as AgentToolUIPart<TUITools> | DynamicToolUIPart;
                  lastMsg.parts[index] =
                    updatedToolPart as unknown as (typeof lastMsg.parts)[number];
                } else if (
                  toolPart.state !== 'output-available' &&
                  toolPart.state !== 'output-error'
                ) {
                  const updatedToolPart:
                    | AgentToolUIPart<TUITools>
                    | DynamicToolUIPart = {
                    ...toolPart,
                    state: 'output-error',
                    input: toolPart.input ?? {},
                    approval: undefined,
                    errorText: outputErrorText,
                  } as AgentToolUIPart<TUITools> | DynamicToolUIPart;
                  lastMsg.parts[index] =
                    updatedToolPart as unknown as (typeof lastMsg.parts)[number];
                }
              }
            });

            while (
              lastMsg.parts.length > 0 &&
              lastMsg.parts[lastMsg.parts.length - 1]!.type === 'reasoning'
            ) {
              lastMsg.parts.pop();
              (
                lastMsg.metadata as MetaWritable | undefined
              )?.partsMetadata?.pop();
            }

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
                  (part as AgentToolUIPart<TUITools> | DynamicToolUIPart)
                    .approval?.id === approvalId,
              );
              if (toolPartIndex !== -1) {
                const part = msg.parts[toolPartIndex] as
                  | AgentToolUIPart<TUITools>
                  | DynamicToolUIPart;
                clearPendingApproval(state.pendingApprovals, part.toolCallId);
                if (part.state === 'approval-requested') {
                  const updatedToolPart: unknown = {
                    ...part,
                    state: 'approval-responded',
                    approval: {
                      ...part.approval,
                      approved,
                      reason,
                    },
                  };
                  msg.parts[toolPartIndex] =
                    updatedToolPart as (typeof msg.parts)[number];
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
              last.metadata ??= {
                createdAt: new Date(),
                partsMetadata: [],
              } as unknown as TMessageMetadata;
              const md = last.metadata as MetaWritable;
              md.attachments = [...(md.attachments ?? []), ...attachments];
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
            } as unknown as TMessageMetadata;
            const md = target.metadata as MetaWritable;
            const envState: NonNullable<MetaWritable['envState']> = {
              ...(md.envState ?? {}),
            };
            for (const [domainId, entry] of entries) {
              envState[domainId] = entry;
            }
            md.envState = envState;
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
              } as unknown as TMessageMetadata;
              (target.metadata as MetaWritable).pathReferences = pathReferences;
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
            } as unknown as TMessageMetadata;
            const md = target.metadata as MetaWritable;
            md.pathReferences = {
              ...(md.pathReferences ?? {}),
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
            } as unknown as TMessageMetadata;
            const emMeta = existingMessage.metadata as MetaWritable;

            uiMessage.parts.forEach(
              (part: (typeof uiMessage.parts)[number], index: number) => {
                if (part.type === 'text' || part.type === 'reasoning') {
                  const streamPart = part as { state: string };
                  emMeta.partsMetadata[index] ??= {
                    startedAt: new Date(),
                    endedAt: undefined,
                  };
                  if (streamPart.state === 'done') {
                    emMeta.partsMetadata[index]!.endedAt ??= new Date();
                  }
                }

                if (
                  (part.type === 'dynamic-tool' ||
                    part.type.startsWith('tool-')) &&
                  (part as AgentToolUIPart<TUITools> | DynamicToolUIPart)
                    .state === 'approval-requested'
                ) {
                  const toolPart = part as
                    | AgentToolUIPart<TUITools>
                    | DynamicToolUIPart;
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
            } as unknown as TMessageMetadata;
            const bm = boundaryMessage.metadata as MetaWritable;
            bm.compressedHistory = compressedHistory;
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
            } as unknown as TMessageMetadata;
            (target.metadata as MetaWritable).ownedReasoningDetails =
              ownedReasoningDetails;
          });
        },
      };
    },
  };
}
