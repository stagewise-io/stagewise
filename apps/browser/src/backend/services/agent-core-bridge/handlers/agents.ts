import type { CommandRegistry } from '@stagewise/agent-core';
import type { HostAgentStateMutations } from '../state/agent-instances';

/**
 * Host surface required by the seam-phase `agents.*` handlers —
 * registered on the `CommandRegistry` before any service that depends
 * on migrated `agents.instances` state is constructed.
 */
export interface AgentsSeamHandlerDeps {
  hostAgentStateMutations: HostAgentStateMutations;
}

/**
 * Registers the `agents.*` command handlers whose dependencies exist
 * at seam-build time.
 *
 *   - `agents.markAsRead` — pure state mutator that toggles
 *     `state.unread = false`. Routed through the bridge because it
 *     interacts exclusively with migrated state and carries no
 *     persistence, validation, or telemetry side effects.
 *
 * Note: `agents.setToolApprovalMode` and `agents.setActiveModelId`
 * are **not** routed through the bridge — their handlers stay on
 * `AgentManagerService` because they mix migrated state writes with
 * persistence, validation, and telemetry. Only their internal
 * `karton.setState` call-sites are swapped for `state-mutations`
 * calls.
 */
export function registerAgentsSeamHandlers(
  registry: CommandRegistry,
  deps: AgentsSeamHandlerDeps,
): void {
  registry.registerCommand<[agentInstanceId: string], void>(
    'agents.markAsRead',
    async (_ctx, [agentInstanceId]) => {
      if (!deps.hostAgentStateMutations.getInstance(agentInstanceId)) return;
      deps.hostAgentStateMutations.setUnread(agentInstanceId, false);
    },
  );
}
