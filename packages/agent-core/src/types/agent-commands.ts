import type { DynamicToolUIPart, UITools } from 'ai';
import type { DomainId, EnvStateEntry } from '../env/contract';
import type {
  AgentMessage,
  AgentRuntimeError,
  AgentState,
  AgentToolUIPart,
} from './agent';
import type {
  AttachmentMetadata,
  OwnedReasoningDetails,
  UserMessageMetadata,
} from './metadata';
import type { UniversalTools } from './tools';

/**
 * Phase 7 narrowed command surface on
 * `AgentInstancesStateController`.
 *
 * Every distinct write intent that `BaseAgent` used to encode as a raw
 * Immer recipe (passed through `state.set((draft) => { ... })`) now
 * exists as a typed method here. This is the stable write contract for
 * Split-Brain: opaque recipes cannot cross a process boundary, a wire
 * protocol, or a journal; discrete typed commands can.
 *
 * The interface is generic so the host can specialize it with its
 * narrowed `AgentState` (branded `activeModelId`, `toolApprovalMode`
 * union) and tool-set type. Core consumers (the migrated `BaseAgent`)
 * use the default generic instantiation.
 *
 * Implementation notes:
 *   - Each method wraps exactly one `store.update()` call, preserving
 *     the D18 transactional guarantee (one subscriber notification per
 *     intent).
 *   - Method bodies are verbatim transliterations of the recipe bodies
 *     in the pre-Phase-7 `base-agent.ts`. No semantics change in
 *     Phase 7; any parity drift indicates a migration bug.
 *   - Missing agent ids are defensive no-ops, except where explicitly
 *     documented as throwing (mirrors the previous recipe behavior).
 */
export interface AgentInstanceCommands<
  TUITools extends UITools = UniversalTools,
  TMessageMetadata = UserMessageMetadata,
  TState extends AgentState<
    AgentMessage<TUITools, TMessageMetadata>
  > = AgentState<AgentMessage<TUITools, TMessageMetadata>>,
> {
  // 1. Seed state from constructor-provided `initialState`.
  hydrateInitialState(args: {
    defaultTitle: string;
    initialState?: Partial<TState>;
    defaultModelId: TState['activeModelId'];
  }): void;

  // 2. Background title-generation write (no persist).
  setTitle(args: { title: string }): void;

  // 3. User-set title; also sets `titleLockedByUser = true`.
  setUserTitle(args: { title: string }): void;

  // 4. Push to `queuedMessages`; returns read-back (modelId, queueLength).
  enqueueUserMessage(args: {
    message: AgentMessage<TUITools, TMessageMetadata> & { role: 'user' };
  }): {
    queuedModelId: string;
    queueLengthAfter: number;
  };

  // 5. Remove one queued message by id.
  removeQueuedMessage(args: { messageId: string }): void;

  // 6. Clear the queue.
  clearQueuedMessages(): void;

  // 7. Append queue into history; clear queue.
  flushQueueIntoHistory(): void;

  // 8a. Walk all history, transition every non-terminal tool part.
  denyAllNonTerminalToolPartsInHistory(args: {
    approvalDenyReason: string;
    forceErrorText: string;
  }): void;

  // 8b. Walk only the last assistant message's tool parts.
  terminateNonTerminalToolPartsInLastAssistant(args: {
    approvalDenyReason: string;
    outputErrorText: string;
  }): void;

  // 9. Resolve approval by approvalId → approval-responded.
  resolveApproval(args: {
    approvalId: string;
    approved: boolean;
    reason?: string;
  }): void;

  // 10. Append one message onto history.
  appendHistoryMessage(args: {
    message: AgentMessage<TUITools, TMessageMetadata>;
  }): void;

  // 11a. Truncate history at an index; clear queue.
  truncateHistoryAt(args: { messageIndex: number }): void;

  // 11b. Find a user message by id, truncate, clear queue. Throws if missing.
  replaceUserMessage(args: { userMessageId: string }): void;

  // 12. Replace `inputState`.
  setInputState(args: { inputState: string }): void;

  // 13. Replace `activeModelId`.
  setActiveModel(args: { modelId: TState['activeModelId'] }): void;

  // 14. Set `isWorking = false` only.
  setIsWorkingFalse(): void;

  // 15. Begin a step; optional queue flush; returns the flush-at index
  //     (or undefined if nothing was flushed).
  beginStep(args: { flushQueue: boolean }): {
    queueFlushIndex: number | undefined;
  };

  // 16. Record step-ending error (or a clean idle transition) in its
  //     three observed modes. When `error` is undefined, the existing
  //     `state.error` is left untouched — supporting the idle-branch
  //     caller that only wants the `isWorking = false` + conditional
  //     unread update without clobbering any prior error.
  recordStepError(args: {
    error: AgentRuntimeError | undefined;
    markUnread: 'always' | 'mark-unread' | 'if-assistant-history';
  }): void;

  // 17. Set cumulative token counter.
  recordUsage(args: { totalTokens: number }): void;

  // 18. Append attachments produced by host-side tool calls during the
  //     current step (e.g. by a sandbox/runtime side-channel) to the
  //     last assistant message. Element type is `AttachmentMetadata`,
  //     the core schema underlying `UserMessageMetadata['attachments']`.
  //     Host metadata overlays extend, never narrow, the attachment shape.
  attachAttachmentsToLastAssistant(args: {
    attachments: AttachmentMetadata[];
  }): void;

  // 19. Attach per-domain env-state entries to the target user message.
  //     Each entry carries the full `state`, plus a frozen `renderedState`
  //     (full-state render) and `renderedStateChange` (diff render). Only
  //     domains whose state changed (or that had no prior state) are
  //     included; unchanged domains are inherited from earlier messages
  //     via `resolveEffectiveEnvStates` at prompt-prep time.
  attachEnvState(args: {
    entries: Map<DomainId, EnvStateEntry>;
    queueFlushStart?: number;
  }): void;

  // 20. Write pathReferences onto multiple user-message metadata slots.
  setUserPathReferences(args: {
    populated: Array<{
      idx: number;
      pathReferences: Record<string, string> | undefined;
    }>;
  }): void;

  // 21. Merge pathReferences into the assistant message at targetIdx.
  mergeAssistantPathReferences(args: {
    targetIdx: number;
    references: Record<string, string>;
  }): void;

  // 22. UI-message stream merge hot path.
  mergeUIMessageStream(args: {
    uiMessage: AgentMessage<TUITools, TMessageMetadata>;
    onApprovalRequested?: (args: {
      approvalId: string;
      toolPart: AgentToolUIPart<TUITools> | DynamicToolUIPart;
    }) => void;
  }): void;

  // 23. Attach compressed history to a boundary message.
  //     Returns 'missing' if the boundary was removed, 'written' otherwise.
  storeCompressedHistory(args: {
    boundaryMessageId: string;
    compressedHistory: string;
  }): 'missing' | 'written';

  // 24. Replace (or clear) the soft-limit usage warning.
  setUsageWarning(args: {
    warning:
      | { windowType: string; usedPercent: number; resetsAt: string }
      | undefined;
  }): void;

  // 25. Set the provider-owned signed reasoning_details on the assistant
  //     message at targetIdx (full replace of the `ownedReasoningDetails`
  //     array; the caller merges/appends per-source before writing).
  setAssistantOwnedReasoningDetails(args: {
    targetIdx: number;
    ownedReasoningDetails: OwnedReasoningDetails[];
  }): void;
}
