/**
 * Host-agnostic contract for environment-state slices attached to user
 * messages.
 *
 * Each {@link DomainAdapter} owns one logical environment domain (e.g.
 * `workspace`, `browser`, `shells`). Adapters:
 *  - capture the current state of their domain via {@link DomainAdapter.getState};
 *  - decide whether the state has changed against a prior state via
 *    {@link DomainAdapter.equals};
 *  - render the state for the LLM via {@link DomainAdapter.renderState} in two
 *    modes — full-state (`prev === null`) and state-diff (`prev !== null`).
 *
 * Agent-core never inspects a domain's `state`; the domain owner does its own
 * type narrowing.
 *
 * See [env-state-spec.md](./env-state-spec.md) for the design.
 */
import { z } from 'zod';
import type { Logger } from '../host/logger';

/** Host-defined domain identifier (core does not enumerate domains). */
export type DomainId = string;

/**
 * Persisted env-state entry for one domain on one user message. Written by
 * {@link DomainAdapterRegistry.captureAll} via the `attachEnvState` command;
 * read by the message-conversion pipeline to render env context in the prompt.
 */
export const envStateEntrySchema = z.object({
  schemaVersion: z.number(),
  state: z.unknown(),
  renderedState: z.string(),
  renderedStateChange: z.string(),
});

export type EnvStateEntry = z.infer<typeof envStateEntrySchema>;

export interface DomainAdapter<TState = unknown> {
  readonly domainId: DomainId;
  readonly renderOrder: number;
  /** Optional schema version stamped on the persisted entry (default `1`). */
  readonly schemaVersion?: number;
  /**
   * Optional prose chunk inserted into the chat system prompt's
   * `<environment>` block in `renderOrder`. The agent reads this once
   * at boot; it does not change per turn. Live state changes flow
   * through {@link DomainAdapter.renderState}.
   *
   * Adapters that don't add domain-specific guidance (e.g. opaque
   * session-id adapters) omit this field.
   */
  readonly promptSection?: string;
  /** Capture this domain's current state from its source of truth. */
  getState(agentInstanceId: string): TState | Promise<TState>;
  /**
   * Render the state for the prompt.
   * - `prev === null` → render the FULL state (used as the per-domain
   *   "renderedState" / keyframe).
   * - `prev !== null` → render the DIFF from `prev` to `curr`. The caller
   *   guarantees `!equals(prev, curr)` when `prev` is non-null.
   */
  renderState(prev: TState | null, curr: TState): string;
  /**
   * Optional equality check. Defaults to deep structural equality via
   * `JSON.stringify`. Override for adapters whose state contains
   * non-JSON-stable fields (e.g. `Date`) or for performance.
   */
  equals?(a: TState, b: TState): boolean;
}

/**
 * Returned by {@link DomainAdapterRegistry.captureAll}. `entries` is keyed by
 * `domainId`. Only domains whose state changed (or that had no prior state)
 * are included; unchanged domains are omitted entirely.
 */
export interface CaptureAllResult {
  entries: Map<DomainId, EnvStateEntry>;
}

/**
 * Registry of {@link DomainAdapter}s plus the orchestration entry point used
 * by `BaseAgent.generateContextForNewStep`. One-adapter-per-domain semantics;
 * re-registering replaces the previous adapter for that id.
 */
export class DomainAdapterRegistry {
  private readonly adapters = new Map<DomainId, DomainAdapter>();

  constructor(private readonly logger?: Logger) {}

  register<TState>(adapter: DomainAdapter<TState>): void {
    this.adapters.set(adapter.domainId, adapter as DomainAdapter);
  }

  unregister(domainId: DomainId): void {
    this.adapters.delete(domainId);
  }

  list(): readonly DomainAdapter[] {
    return [...this.adapters.values()];
  }

  /**
   * Returns adapters sorted by ascending `renderOrder`. Used by the prompt
   * builder to compose per-domain `renderedState`/`renderedStateChange`
   * strings in a stable, canonical order.
   */
  listSorted(): readonly DomainAdapter[] {
    return [...this.adapters.values()].sort(
      (a, b) => a.renderOrder - b.renderOrder,
    );
  }

  get(domainId: DomainId): DomainAdapter | undefined {
    return this.adapters.get(domainId);
  }

  /**
   * Run every registered adapter in parallel.
   *
   * For each adapter:
   *  1. `getState(agentInstanceId)` produces `curr`.
   *  2. `equals(prev, curr)` (or the default deep-equal) decides whether the
   *     state changed.
   *  3. If unchanged → omit. The previous entry on the prior user message
   *     remains the source of truth for that domain.
   *  4. If changed (or no prior state) → render `renderedState` =
   *     `renderState(null, curr)` AND `renderedStateChange` =
   *     `renderState(prev, curr)` (which collapses to `renderedState` when
   *     `prev === null`).
   *
   * Per-adapter failures are isolated: a thrown error is logged and the
   * adapter is omitted from `entries` (its prior state remains effective).
   */
  async captureAll(
    prev: Record<DomainId, unknown>,
    agentInstanceId: string,
  ): Promise<CaptureAllResult> {
    const adapters = this.list();
    const results = await Promise.all(
      adapters.map(async (adapter) => {
        try {
          const curr = await adapter.getState(agentInstanceId);
          const previousRaw = prev[adapter.domainId];
          const hasPrev = previousRaw !== undefined;
          const previous = hasPrev ? previousRaw : null;
          const unchanged = hasPrev
            ? defaultOrAdapterEquals(adapter, previous, curr)
            : false;
          if (unchanged) {
            return { adapter, entry: null as EnvStateEntry | null };
          }
          const renderedState = adapter.renderState(null, curr);
          const renderedStateChange = hasPrev
            ? adapter.renderState(previous as unknown, curr)
            : renderedState;
          const entry: EnvStateEntry = {
            schemaVersion: adapter.schemaVersion ?? 1,
            state: curr,
            renderedState,
            renderedStateChange,
          };
          return { adapter, entry };
        } catch (error) {
          this.logger?.error(
            `[DomainAdapterRegistry] adapter '${adapter.domainId}' threw during captureAll`,
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { error },
          );
          return { adapter, entry: null as EnvStateEntry | null };
        }
      }),
    );

    const entries = new Map<DomainId, EnvStateEntry>();
    for (const { adapter, entry } of results) {
      if (entry) entries.set(adapter.domainId, entry);
    }
    return { entries };
  }
}

function defaultOrAdapterEquals<TState>(
  adapter: DomainAdapter<TState>,
  a: unknown,
  b: unknown,
): boolean {
  if (adapter.equals) {
    return adapter.equals(a as TState, b as TState);
  }
  return defaultEquals(a, b);
}

/**
 * Default equality used by {@link DomainAdapterRegistry.captureAll} when an
 * adapter doesn't supply its own. Exported for use in tests.
 *
 * Deep structural equality via canonical JSON serialization. Object keys are
 * sorted so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` compare equal.
 */
export function defaultEquals(a: unknown, b: unknown): boolean {
  return canonicalStringify(a) === canonicalStringify(b);
}

function canonicalStringify(v: unknown): string {
  return JSON.stringify(v, (_, value) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  });
}

/**
 * Minimal message shape required for {@link resolveEffectiveEnvStates}.
 * Loose so host-extended message types (e.g. tab-mention metadata) still
 * satisfy the constraint.
 */
interface MessageWithEnvState {
  metadata?: { envState?: Record<DomainId, EnvStateEntry> } | undefined;
}

/**
 * Walk history backward from `upToIndex` and collect the most recent
 * persisted `state` per domain id. Used by the BaseAgent run-loop to feed
 * each adapter's `captureAll` with the right baseline.
 *
 * Returns the typed-but-opaque `state` value (not the full
 * {@link EnvStateEntry}); rendered strings on the prior message are
 * positional and not relevant to the next turn's diff computation.
 */
export function resolveEffectiveEnvStates(
  messages: readonly MessageWithEnvState[],
  upToIndex: number,
): Record<DomainId, unknown> {
  const out: Record<DomainId, unknown> = {};
  for (let i = upToIndex; i >= 0; i--) {
    const envState = messages[i]?.metadata?.envState;
    if (!envState) continue;
    for (const [domainId, entry] of Object.entries(envState)) {
      if (!(domainId in out)) {
        out[domainId] = entry.state;
      }
    }
  }
  return out;
}

/**
 * Walk history backward from `upToIndex` and collect the most recent
 * persisted {@link EnvStateEntry} per domain id.
 *
 * Used by the message-conversion pipeline to render the per-domain
 * full-state keyframe at the compression boundary (or fresh-chat start):
 * each entry's `renderedState` is the canonical full render of the
 * domain at the time it was captured, and an unchanged domain keeps its
 * last-captured `renderedState` valid until the next capture stamps a
 * new entry.
 */
export function resolveEffectiveEnvStateEntries(
  messages: readonly MessageWithEnvState[],
  upToIndex: number,
): Record<DomainId, EnvStateEntry> {
  const out: Record<DomainId, EnvStateEntry> = {};
  for (let i = upToIndex; i >= 0; i--) {
    const envState = messages[i]?.metadata?.envState;
    if (!envState) continue;
    for (const [domainId, entry] of Object.entries(envState)) {
      if (!(domainId in out)) {
        out[domainId] = entry;
      }
    }
  }
  return out;
}
