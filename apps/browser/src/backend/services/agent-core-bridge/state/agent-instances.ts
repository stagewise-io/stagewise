import {
  getAgentInstance,
  setUnread as setAgentUnread,
  updateAgentInstanceState,
  type AgentInstanceEnvelope,
  type AgentStore,
} from '@stagewise/agent-core';
import type { AgentState } from '@shared/karton-contracts/ui/agent';
import type { ModelSettings } from '@shared/karton-contracts/ui/shared-types';

/**
 * Host-narrowed envelope exposed to browser call sites.
 *
 * The core {@link AgentInstanceEnvelope} keeps `state` and
 * `requiredModelCapabilities` deliberately wide so different hosts can
 * specialize them. Re-typing both here surfaces the branded
 * `activeModelId` / `toolApprovalMode` (D14 / D22) and the structured
 * Karton `ModelSettings['capabilities']` at the controller boundary;
 * the underlying store is unaffected because the host state is a
 * structural subtype of the core state.
 */
export type HostAgentInstanceEnvelope = Omit<
  AgentInstanceEnvelope,
  'state' | 'requiredModelCapabilities'
> & {
  state: AgentState;
  requiredModelCapabilities: ModelSettings['capabilities'];
};

/**
 * Host adapter for the core `setUnread` mutation, the browser-specific
 * `recordPendingApproval` intent, and a typed `getInstance` peek. Each write
 * preserves the D18 one-`store.update`-per-intent transactional guarantee.
 */
export interface HostAgentStateMutations {
  /**
   * Field-level write for the unread-on-question side effect in the
   * `askUserQuestions` tool. No-op if the agent id is not present.
   */
  setUnread(agentInstanceId: string, value: boolean): void;
  /**
   * Field-level write for `ToolboxService.recordPendingApproval`.
   * Stores the smart-approval explanation under the `toolCallId` key
   * of `state.pendingApprovals`. No-op if the agent id is not
   * present.
   */
  recordPendingApproval(
    agentInstanceId: string,
    toolCallId: string,
    explanation: string,
  ): void;
  /**
   * Typed re-export of the core `getAgentInstance` peek, narrowed to
   * the host envelope shape so call sites can read host fields without
   * casting.
   */
  getInstance(agentInstanceId: string): HostAgentInstanceEnvelope | undefined;
}

/**
 * Build the bundle of host-specific agent-state mutations.
 *
 * Stays separate from the core `state-mutations` barrel because it adapts
 * browser-only call sites (`askUserQuestions`, smart-approval metadata) to
 * the shared store. CRUD + per-instance intents live on
 * `@stagewise/agent-core` and `AgentManager` calls them directly against the
 * same `AgentStore`.
 */
export function createHostAgentStateMutations(
  store: AgentStore,
): HostAgentStateMutations {
  return {
    setUnread(agentInstanceId, value) {
      setAgentUnread(store, agentInstanceId, { unread: value });
    },
    recordPendingApproval(agentInstanceId, toolCallId, explanation) {
      updateAgentInstanceState(store, agentInstanceId, (state) => {
        state.pendingApprovals[toolCallId] = { explanation };
      });
    },
    getInstance(agentInstanceId) {
      const entry = getAgentInstance(store, agentInstanceId);
      return entry as HostAgentInstanceEnvelope | undefined;
    },
  };
}
