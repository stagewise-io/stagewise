import type { AgentStore } from '../../../store/agent-store';
import {
  denyAllNonTerminalToolPartsInHistory,
  resolveApproval,
  terminateNonTerminalToolPartsInLastAssistant,
} from './approvals';
import {
  appendHistoryMessage,
  replaceUserMessage,
  truncateHistoryAt,
} from './history';
import { beginStep, hydrateInitialState, recordStepError } from './lifecycle';
import {
  attachAttachmentsToLastAssistant,
  attachEnvState,
  mergeAssistantPathReferences,
  setUserPathReferences,
} from './metadata';
import {
  clearQueuedMessages,
  enqueueUserMessage,
  flushQueueIntoHistory,
  removeQueuedMessage,
} from './queue';
import {
  recordUsage,
  setActiveModel,
  setInputState,
  setIsWorkingFalse,
  setTitle,
  setUsageWarning,
  setUserTitle,
} from './simple';
import {
  mergeUIMessageStream,
  setAssistantOwnedReasoningDetails,
  storeCompressedHistory,
} from './streaming';

/**
 * Per-instance bound bundle handed to `BaseAgent` via
 * `BaseAgentDependencies.state.commands`. Wraps each pure state-
 * mutation function with its `(store, agentInstanceId)` already
 * applied so the runloop reads as `commands.setTitle({ title })`.
 *
 * The return type is intentionally not declared — consumers import
 * the inferred {@link AgentStateMutations} alias instead. This keeps
 * the bundle's shape derived directly from the underlying functions
 * (no separate interface to drift) and lets future additions flow
 * through without touching a type declaration.
 *
 * The bundle uses default generic instantiations (`UniversalTools` /
 * `UserMessageMetadata`) because `BaseAgent` itself consumes the
 * default-instantiated `AgentState`. Hosts that want narrowed
 * branding wrap the underlying pure functions directly in their own
 * adapters rather than going through this bundle.
 */
export function bindStateMutations(store: AgentStore, agentInstanceId: string) {
  return {
    hydrateInitialState: (args: Parameters<typeof hydrateInitialState>[2]) =>
      hydrateInitialState(store, agentInstanceId, args),
    beginStep: (args: Parameters<typeof beginStep>[2]) =>
      beginStep(store, agentInstanceId, args),
    recordStepError: (args: Parameters<typeof recordStepError>[2]) =>
      recordStepError(store, agentInstanceId, args),

    setTitle: (args: Parameters<typeof setTitle>[2]) =>
      setTitle(store, agentInstanceId, args),
    setUserTitle: (args: Parameters<typeof setUserTitle>[2]) =>
      setUserTitle(store, agentInstanceId, args),
    setInputState: (args: Parameters<typeof setInputState>[2]) =>
      setInputState(store, agentInstanceId, args),
    setActiveModel: (args: Parameters<typeof setActiveModel>[2]) =>
      setActiveModel(store, agentInstanceId, args),
    setIsWorkingFalse: () => setIsWorkingFalse(store, agentInstanceId),
    setUsageWarning: (args: Parameters<typeof setUsageWarning>[2]) =>
      setUsageWarning(store, agentInstanceId, args),
    recordUsage: (args: Parameters<typeof recordUsage>[2]) =>
      recordUsage(store, agentInstanceId, args),

    enqueueUserMessage: (args: Parameters<typeof enqueueUserMessage>[2]) =>
      enqueueUserMessage(store, agentInstanceId, args),
    removeQueuedMessage: (args: Parameters<typeof removeQueuedMessage>[2]) =>
      removeQueuedMessage(store, agentInstanceId, args),
    clearQueuedMessages: () => clearQueuedMessages(store, agentInstanceId),
    flushQueueIntoHistory: () => flushQueueIntoHistory(store, agentInstanceId),

    appendHistoryMessage: (args: Parameters<typeof appendHistoryMessage>[2]) =>
      appendHistoryMessage(store, agentInstanceId, args),
    truncateHistoryAt: (args: Parameters<typeof truncateHistoryAt>[2]) =>
      truncateHistoryAt(store, agentInstanceId, args),
    replaceUserMessage: (args: Parameters<typeof replaceUserMessage>[2]) =>
      replaceUserMessage(store, agentInstanceId, args),

    denyAllNonTerminalToolPartsInHistory: (
      args: Parameters<typeof denyAllNonTerminalToolPartsInHistory>[2],
    ) => denyAllNonTerminalToolPartsInHistory(store, agentInstanceId, args),
    terminateNonTerminalToolPartsInLastAssistant: (
      args: Parameters<typeof terminateNonTerminalToolPartsInLastAssistant>[2],
    ) =>
      terminateNonTerminalToolPartsInLastAssistant(
        store,
        agentInstanceId,
        args,
      ),
    resolveApproval: (args: Parameters<typeof resolveApproval>[2]) =>
      resolveApproval(store, agentInstanceId, args),

    mergeUIMessageStream: (args: Parameters<typeof mergeUIMessageStream>[2]) =>
      mergeUIMessageStream(store, agentInstanceId, args),
    storeCompressedHistory: (
      args: Parameters<typeof storeCompressedHistory>[2],
    ) => storeCompressedHistory(store, agentInstanceId, args),
    setAssistantOwnedReasoningDetails: (
      args: Parameters<typeof setAssistantOwnedReasoningDetails>[2],
    ) => setAssistantOwnedReasoningDetails(store, agentInstanceId, args),

    attachAttachmentsToLastAssistant: (
      args: Parameters<typeof attachAttachmentsToLastAssistant>[2],
    ) => attachAttachmentsToLastAssistant(store, agentInstanceId, args),
    attachEnvState: (args: Parameters<typeof attachEnvState>[2]) =>
      attachEnvState(store, agentInstanceId, args),
    setUserPathReferences: (
      args: Parameters<typeof setUserPathReferences>[2],
    ) => setUserPathReferences(store, agentInstanceId, args),
    mergeAssistantPathReferences: (
      args: Parameters<typeof mergeAssistantPathReferences>[2],
    ) => mergeAssistantPathReferences(store, agentInstanceId, args),
  };
}

/**
 * Inferred shape of the bound bundle returned by
 * {@link bindStateMutations}. `BaseAgent` annotates its
 * `state.commands` slot with this alias so the public surface is
 * derived from the underlying functions rather than a hand-written
 * interface.
 */
export type AgentStateMutations = ReturnType<typeof bindStateMutations>;
