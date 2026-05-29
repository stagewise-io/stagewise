import type { AgentTypes } from '../types/agent';

/**
 * Host-extensible binding of `AgentTypes` ids to concrete agent
 * constructor types.
 *
 * `@stagewise/agent-core` ships this interface empty on purpose. Every host
 * augments it through TypeScript declaration merging when it registers its
 * agents, so the core package never has to import concrete subclasses of
 * `BaseAgent` — which would create a host → core circular dependency.
 *
 * @example Host-side augmentation
 * ```ts
 * import { AgentTypes } from '@stagewise/agent-core/types/agent';
 * import { ChatAgent } from './chat';
 * import { WorkspaceMdAgent } from './workspace-md';
 *
 * declare module '@stagewise/agent-core/agents' {
 *   interface AgentTypeMap {
 *     [AgentTypes.CHAT]: typeof ChatAgent;
 *     [AgentTypes.WORKSPACE_MD]: typeof WorkspaceMdAgent;
 *   }
 * }
 * ```
 *
 * With the augmentation in scope, `AgentCtor<AgentTypes.CHAT>` resolves to
 * `typeof ChatAgent` and `new registry.get(AgentTypes.CHAT)!(...)` type-checks
 * against `ChatAgent`'s constructor signature.
 */
// biome-ignore lint/suspicious/noEmptyInterface: Public augmentation seam — hosts merge into this interface.
export interface AgentTypeMap {}

/**
 * Resolves to the constructor bound to `T` in the (possibly host-augmented)
 * `AgentTypeMap`. Without host augmentation this is `never` and both
 * `register` and `get` are statically unusable — which is the intended
 * compile-time signal that no host has been wired yet.
 */
export type AgentCtor<T extends AgentTypes> = T extends keyof AgentTypeMap
  ? AgentTypeMap[T]
  : never;

/**
 * Instance-based registry mapping `AgentTypes` ids to concrete agent
 * constructors.
 *
 * The registry is intentionally **not** a singleton. Each host creates its
 * own instance at boot, registers the agents it wants to expose, and threads
 * the instance into `BaseAgent.spawnChildAgentHandler` and
 * `AgentManager.createAgent` through the host interface. This keeps test
 * isolation straightforward and avoids hidden module-level state.
 *
 * The runtime map is typed as `unknown` internally; type-safety is recovered
 * at the method boundaries through the `AgentTypeMap` lookup, so hosts still
 * get precise `InstanceType<AgentCtor<T>>['instanceConfig']` narrowing at
 * construction sites.
 */
export class AgentTypeRegistry {
  private readonly ctors = new Map<AgentTypes, unknown>();

  /**
   * Register a concrete constructor for `type`. A later call with the same
   * `type` overwrites the earlier registration. Intended to be called once
   * per agent type during host boot.
   */
  register<T extends AgentTypes>(type: T, ctor: AgentCtor<T>): void {
    this.ctors.set(type, ctor);
  }

  /**
   * Retrieve the constructor bound to `type`, or `undefined` if no host has
   * registered it. Callers that only run after host boot can safely assert
   * non-null; generic spawn paths (`spawnChildAgent`) should check first and
   * fail loudly.
   */
  get<T extends AgentTypes>(type: T): AgentCtor<T> | undefined {
    return this.ctors.get(type) as AgentCtor<T> | undefined;
  }

  /** `true` if `type` has been registered. */
  has(type: AgentTypes): boolean {
    return this.ctors.has(type);
  }

  /**
   * Iterable of all registered `[type, constructor]` pairs, preserving
   * insertion order. Returned constructors are typed as `unknown` because
   * the entry-level type cannot discriminate per-key; narrow through
   * `registry.get(type)` instead when the specific type is known.
   */
  entries(): IterableIterator<[AgentTypes, unknown]> {
    return this.ctors.entries();
  }

  /** Number of registered agent types. */
  get size(): number {
    return this.ctors.size;
  }
}
