import { type Draft, produce } from 'immer';
import type { UITools } from 'ai';
import type { UniversalTools } from '../types/tools';
import type { AgentSystemState } from './state';

/**
 * Synchronous subscriber invoked on every committed state mutation.
 *
 * Subscribers receive the post-recipe `state` and the `previous` state that
 * was in effect just before the mutation. Per D18, subscribers never observe
 * intermediate Immer drafts — only the settled post-recipe state.
 */
export type StateListener<
  TTools extends UITools = UniversalTools,
  TQuestionField = unknown,
  TQuestionAnswer = unknown,
> = (
  state: AgentSystemState<TTools, TQuestionField, TQuestionAnswer>,
  previous: AgentSystemState<TTools, TQuestionField, TQuestionAnswer>,
) => void;

/**
 * Side-effect subscriber. Same arguments as `StateListener`, but may return a
 * promise. The store tracks in-flight promises so commands can await
 * readiness (D19).
 */
export type SideEffectListener<
  TTools extends UITools = UniversalTools,
  TQuestionField = unknown,
  TQuestionAnswer = unknown,
> = (
  state: AgentSystemState<TTools, TQuestionField, TQuestionAnswer>,
  previous: AgentSystemState<TTools, TQuestionField, TQuestionAnswer>,
) => void | Promise<void>;

/**
 * Handle returned from `registerSideEffect`. Lets commands await the
 * listener's most-recent invocation via `readiness()` before resolving.
 */
export interface SideEffectHandle {
  /**
   * Resolves once the listener's most recent invocation has finished. If the
   * listener has not yet been invoked (no state update happened since
   * registration), resolves immediately.
   */
  readiness(): Promise<void>;
  /** Removes the listener. Safe to call multiple times. */
  unregister(): void;
}

/**
 * In-memory canonical agent state store.
 *
 * Mutations are expressed as Immer recipes via `update(recipe)`. Plain
 * subscribers (`subscribe`) run synchronously in registration order;
 * side-effect subscribers (`registerSideEffect`) run synchronously but may
 * return a promise. `whenSettled()` awaits all in-flight side-effect
 * promises from the most recent update.
 *
 * Nested updates are disallowed; a subscriber that calls `update` will
 * throw. Subscriber errors propagate synchronously out of `update`.
 * Side-effect listener errors are surfaced as rejected promises via
 * `readiness()` and `whenSettled()`.
 */
export class AgentStore<
  TTools extends UITools = UniversalTools,
  TQuestionField = unknown,
  TQuestionAnswer = unknown,
> {
  private state: AgentSystemState<TTools, TQuestionField, TQuestionAnswer>;
  private readonly subscribers = new Set<
    StateListener<TTools, TQuestionField, TQuestionAnswer>
  >();
  private readonly sideEffects = new Set<
    SideEffectEntry<TTools, TQuestionField, TQuestionAnswer>
  >();
  private isUpdating = false;

  constructor(
    initial: AgentSystemState<TTools, TQuestionField, TQuestionAnswer>,
  ) {
    this.state = initial;
  }

  /** Returns the current state snapshot. */
  get(): AgentSystemState<TTools, TQuestionField, TQuestionAnswer> {
    return this.state;
  }

  /**
   * Applies an Immer recipe to the current state. If the recipe performs no
   * mutation (same reference returned by `produce`), listeners are not
   * invoked.
   */
  update(
    recipe: (
      draft: Draft<AgentSystemState<TTools, TQuestionField, TQuestionAnswer>>,
    ) => void,
  ): void {
    if (this.isUpdating) {
      throw new Error('nested AgentStore.update is not allowed');
    }

    this.isUpdating = true;
    try {
      const previous = this.state;
      const next = produce(previous, recipe);
      this.state = next;

      if (next === previous) {
        return;
      }

      // Plain subscribers: synchronous, errors propagate.
      for (const listener of this.subscribers) {
        listener(next, previous);
      }

      // Side-effect subscribers: synchronous dispatch, promise tracked.
      for (const entry of this.sideEffects) {
        let result: void | Promise<void>;
        try {
          result = entry.listener(next, previous);
        } catch (err) {
          entry.pending = Promise.reject(err);
          continue;
        }
        entry.pending =
          result && typeof (result as Promise<void>).then === 'function'
            ? (result as Promise<void>)
            : Promise.resolve();
      }
    } finally {
      this.isUpdating = false;
    }
  }

  /** Registers a synchronous subscriber. Returns an unsubscribe function. */
  subscribe(
    listener: StateListener<TTools, TQuestionField, TQuestionAnswer>,
  ): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  /**
   * Registers a side-effect subscriber. Returns a `SideEffectHandle` whose
   * `readiness()` resolves when the listener's most-recent invocation has
   * settled.
   */
  registerSideEffect(
    listener: SideEffectListener<TTools, TQuestionField, TQuestionAnswer>,
  ): SideEffectHandle {
    const entry: SideEffectEntry<TTools, TQuestionField, TQuestionAnswer> = {
      listener,
      pending: Promise.resolve(),
    };
    this.sideEffects.add(entry);
    return {
      readiness: () => entry.pending,
      unregister: () => {
        this.sideEffects.delete(entry);
      },
    };
  }

  /**
   * Resolves once every registered side-effect listener's most-recent
   * invocation has settled. Rejects with the first listener error.
   */
  async whenSettled(): Promise<void> {
    const pending = Array.from(this.sideEffects, (entry) => entry.pending);
    await Promise.all(pending);
  }
}

interface SideEffectEntry<
  TTools extends UITools,
  TQuestionField,
  TQuestionAnswer,
> {
  listener: SideEffectListener<TTools, TQuestionField, TQuestionAnswer>;
  pending: Promise<void>;
}
