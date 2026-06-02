import type { AgentStore } from '../../../store/agent-store';
import type { AgentRuntimeError, AgentState } from '../../../types/agent';
import { updateAgentInstanceState } from './internal';

/**
 * Turn-lifecycle state transitions. Each call is exactly one
 * `store.update()`.
 */

/**
 * Seed `state` from `initialState` when an agent instance is hydrated
 * (fresh creation or resume from disk). Throws if the agent id is not
 * present, matching the pre-refactor recipe behavior — hydration is
 * never expected to race a deletion.
 */
export function hydrateInitialState(
  store: AgentStore,
  agentInstanceId: string,
  args: {
    defaultTitle: string;
    initialState?: Partial<AgentState>;
    defaultModelId: AgentState['activeModelId'];
  },
): void {
  updateAgentInstanceState(
    store,
    agentInstanceId,
    (state) => {
      state.title = args.initialState?.title ?? args.defaultTitle;
      state.titleLockedByUser = args.initialState?.titleLockedByUser;
      state.history = args.initialState?.history ?? [];
      state.queuedMessages = args.initialState?.queuedMessages ?? [];
      state.activeModelId =
        args.initialState?.activeModelId ?? args.defaultModelId;
      state.toolApprovalMode =
        args.initialState?.toolApprovalMode ?? state.toolApprovalMode;
      state.pendingApprovals = args.initialState?.pendingApprovals ?? {};
      state.inputState = args.initialState?.inputState ?? state.inputState;
      state.usedTokens = args.initialState?.usedTokens ?? 0;
    },
    { throwOnMissing: true, source: 'hydrateInitialState' },
  );
}

/**
 * Mark the agent as actively running, clear any prior error, and
 * optionally flush the queue into history. Returns the index in
 * `history` at which the flush started (or `undefined` if nothing
 * flushed) so callers can stitch up downstream metadata.
 */
export function beginStep(
  store: AgentStore,
  agentInstanceId: string,
  args: { flushQueue: boolean },
): { queueFlushIndex: number | undefined } {
  let queueFlushIndex: number | undefined;
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    state.isWorking = true;
    state.error = undefined;
    if (args.flushQueue && state.queuedMessages.length > 0) {
      queueFlushIndex = state.history.length;
      state.history.push(...state.queuedMessages);
      state.queuedMessages = [];
    }
  });
  return { queueFlushIndex };
}

/**
 * Record a step-ending error (or a clean idle transition when `error`
 * is `undefined` — the latter is used by the idle branch that only
 * wants `isWorking = false` plus a conditional unread bump).
 */
export function recordStepError(
  store: AgentStore,
  agentInstanceId: string,
  args: {
    error: AgentRuntimeError | undefined;
    markUnread: 'always' | 'mark-unread' | 'if-assistant-history';
  },
): void {
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    state.isWorking = false;
    if (args.error !== undefined) {
      state.error = args.error;
    }
    if (args.markUnread === 'always' || args.markUnread === 'mark-unread') {
      state.unread = true;
    } else if (args.markUnread === 'if-assistant-history') {
      if (state.history.some((m) => m.role === 'assistant')) {
        state.unread = true;
      }
    }
  });
}
