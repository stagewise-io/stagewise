import type { AgentStore } from '../../../store/agent-store';
import type { AgentMessage } from '../../../types/agent';
import { updateAgentInstanceState } from './internal';

/**
 * Queued-message mutations. Each is exactly one `store.update()`.
 */

/**
 * Append a user message to `queuedMessages` and read back the active
 * model id + the post-push queue length so callers can emit telemetry
 * without a separate store read.
 */
export function enqueueUserMessage(
  store: AgentStore,
  agentInstanceId: string,
  args: { message: AgentMessage & { role: 'user' } },
): { queuedModelId: string; queueLengthAfter: number } {
  let queuedModelId = 'unknown';
  let queueLengthAfter = 0;
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    state.queuedMessages.push(args.message);
    queuedModelId = state.activeModelId ?? 'unknown';
    queueLengthAfter = state.queuedMessages.length;
  });
  return { queuedModelId, queueLengthAfter };
}

export function removeQueuedMessage(
  store: AgentStore,
  agentInstanceId: string,
  args: { messageId: string },
): void {
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    state.queuedMessages = state.queuedMessages.filter(
      (m) => m.id !== args.messageId,
    );
  });
}

export function moveQueuedMessage(
  store: AgentStore,
  agentInstanceId: string,
  args: { messageId: string; toIndex: number },
): boolean {
  let found = false;
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    const index = state.queuedMessages.findIndex(
      (message) => message.id === args.messageId,
    );
    if (index < 0) return;

    state.queuedMessages.splice(
      args.toIndex,
      0,
      ...state.queuedMessages.splice(index, 1),
    );
    found = true;
  });
  return found;
}

export function clearQueuedMessages(
  store: AgentStore,
  agentInstanceId: string,
): void {
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    state.queuedMessages = [];
  });
}
