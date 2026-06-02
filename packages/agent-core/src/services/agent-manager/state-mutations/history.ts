import type { AgentStore } from '../../../store/agent-store';
import type { AgentMessage } from '../../../types/agent';
import { updateAgentInstanceState } from './internal';

/**
 * History-shape mutations. Each is exactly one `store.update()`.
 */

export function appendHistoryMessage(
  store: AgentStore,
  agentInstanceId: string,
  args: { message: AgentMessage },
): void {
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    state.history.push(args.message);
  });
}

/**
 * Truncate history at `messageIndex` and clear the queue. Defensive
 * no-op on missing ids — used both as a normal interrupt path and on
 * revert flows where the agent may already be gone.
 */
export function truncateHistoryAt(
  store: AgentStore,
  agentInstanceId: string,
  args: { messageIndex: number },
): void {
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    state.history = state.history.slice(0, args.messageIndex);
    state.queuedMessages = [];
  });
}

/**
 * Look up a user message by id, truncate history up to (but excluding)
 * it, and clear the queue. Throws if the user message is not in
 * history — matches the pre-refactor recipe.
 */
export function replaceUserMessage(
  store: AgentStore,
  agentInstanceId: string,
  args: { userMessageId: string },
): void {
  updateAgentInstanceState(
    store,
    agentInstanceId,
    (state) => {
      const replaceMessageIndex = state.history.findIndex(
        (m) => m.id === args.userMessageId,
      );
      if (replaceMessageIndex === -1) {
        throw new Error('User message not found in history');
      }
      state.history = state.history.slice(0, replaceMessageIndex);
      state.queuedMessages = [];
    },
    { source: 'replaceUserMessage' },
  );
}
