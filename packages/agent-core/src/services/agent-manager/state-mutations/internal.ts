import type { AgentStore } from '../../../store/agent-store';
import type { AgentSystemState } from '../../../store/state';
import type { AgentState } from '../../../types/agent';

/**
 * Shared transactional helper used by every state-mutation utility.
 *
 * Wraps exactly one `store.update()` per call, looks up the agent
 * instance by id, and hands its `state` to the `mutate` callback. The
 * one-`store.update`-per-intent rule is the source of truth for the
 * D18 transactional guarantee: subscribers see at most one
 * notification per intent.
 *
 * Missing-id behavior:
 *   - Default: defensive no-op (silently returns).
 *   - `throwOnMissing: true`: throws an `Error` tagged with the optional
 *     `source` label. Use this for intents whose pre-Phase-7 recipe
 *     bodies explicitly threw on missing ids.
 *
 * Exported so hosts can build their own narrow setters on the same
 * transactional foundation (e.g. browser `setUnread`,
 * `recordPendingApproval`) without reaching into `store.update` directly.
 */
export function updateAgentInstanceState(
  store: AgentStore,
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
          `agent-instance-state${opts.source ? `.${opts.source}` : ''}: unknown agent instance id '${agentInstanceId}'`,
        );
      }
      return;
    }
    mutate(entry.state);
  });
}
