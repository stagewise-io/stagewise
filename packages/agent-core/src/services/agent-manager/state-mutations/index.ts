/**
 * Agent-instance state-mutation utilities.
 *
 * Every per-instance write to `AgentStore.agents.instances[id].state`
 * goes through one of these pure functions. Each function wraps
 * exactly one `store.update()`, preserving the D18 transactional
 * guarantee (one subscriber notification per intent).
 *
 * The {@link bindStateMutations} helper packages the per-instance
 * intents into a bound bundle that `BaseAgent` consumes via
 * `state.commands.X(...)`. The bundle's type is inferred
 * ({@link AgentStateMutations}) — adding or renaming a mutation
 * automatically reshapes the bundle.
 *
 * Hosts that need to add their own narrow setters (e.g. browser's
 * `setUnread`, `recordPendingApproval`) should build them on top of
 * the exported {@link updateAgentInstanceState} helper so they share
 * the same one-store-update-per-intent discipline.
 */

export * from './approvals';
export * from './bind';
export * from './history';
export * from './instances';
export * from './internal';
export * from './lifecycle';
export * from './metadata';
export * from './queue';
export * from './simple';
export * from './streaming';
