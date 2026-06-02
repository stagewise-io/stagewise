import type { AgentTypes } from '../types/agent';
import type { AgentTypeMap, AgentTypeRegistry } from './agents-registry';

export type { AgentTypeMap } from './agents-registry';

/**
 * Type-level, read-only view over the (possibly host-augmented)
 * `AgentTypeMap`.
 *
 * Mirrors the legacy browser-side `AgentsMap` constant's shape so call sites
 * that used `(typeof AgentsMap)[TAgentType]['config']['finishToolOutputSchema']`
 * can migrate to `AgentsMap[TAgentType]['config']['finishToolOutputSchema']`
 * without structural changes.
 *
 * This is purely a type. Runtime lookups must go through
 * {@link AgentTypeRegistry.get} or {@link toAgentsMap} — there is no
 * module-level `AgentsMap` value in core, by design.
 */
export type AgentsMap = {
  readonly [K in keyof AgentTypeMap]: AgentTypeMap[K];
};

/**
 * Materialise a plain object view of an {@link AgentTypeRegistry} that
 * matches the {@link AgentsMap} type. Useful at spawn sites that benefit
 * from static indexing (`map[type]`) rather than an imperative `get(type)`
 * call — e.g. when the caller already guards against `undefined` via a
 * prior `registry.has(type)` check.
 *
 * Only keys present in the registry appear on the returned object. Missing
 * keys are left unset (which `AgentsMap` permits because its keys are
 * driven entirely by host-side declaration merging — core itself contributes
 * nothing).
 */
export function toAgentsMap(registry: AgentTypeRegistry): AgentsMap {
  const out = {} as { [K in AgentTypes]?: unknown };
  for (const [type, ctor] of registry.entries()) {
    out[type] = ctor;
  }
  return out as AgentsMap;
}
