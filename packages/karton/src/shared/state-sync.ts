import { produce, freeze, enablePatches, type Patch } from 'immer';
import type { Draft } from 'immer';
import type { Message } from './types.js';
import {
  createStateSyncMessage,
  createStatePatchMessage,
  isStateSyncMessage,
  isStatePatchMessage,
} from './messages.js';
import { applyPatchesDirect } from './apply-patches.js';

// Enable Immer patches globally
enablePatches();

export class StateManager<T> {
  private state: T;
  private broadcast: (message: Message) => void;

  constructor(initialState: T, broadcast: (message: Message) => void) {
    this.state = freeze(initialState as any, true) as T;
    this.broadcast = broadcast;
  }

  public setState(recipe: (draft: Draft<T>) => void): T {
    let patches: Patch[] = [];
    let _inversePatches: Patch[] = [];

    const newState = produce(this.state, recipe, (p, ip) => {
      patches = p;
      _inversePatches = ip;
    });

    if (patches.length > 0) {
      this.state = freeze(newState, true) as T;
      const patchMessage = createStatePatchMessage(patches);
      this.broadcast(patchMessage);
    }

    return this.state;
  }

  public getState(): Readonly<T> {
    return this.state;
  }

  public getFullStateSyncMessage(): Message {
    return createStateSyncMessage(this.state);
  }
}

/**
 * Client-side state manager that receives patches from the backend.
 *
 * ## Why client state is NOT frozen
 *
 * The backend `StateManager` freezes its state because Immer's `produce`
 * requires a frozen base to detect mutations.  On the client side we
 * intentionally skip `Object.freeze` for two reasons:
 *
 * 1. **Performance**: `freeze(state, true)` recursively walks the entire
 *    state tree — O(state_size) on every patch application.  For large
 *    chat histories with many tool parts this dominated the client-side
 *    cost (measured 8-15ms per patch batch on M4, worse on slower HW).
 *
 * 2. **No mutation risk on the client**: Client state is read via
 *    `useSyncExternalStore` selectors which only read — there is no
 *    `produce()` call on the client that could be confused by unfrozen
 *    state.  `applyPatchesDirect` is the only writer and it creates
 *    fresh shallow copies along modified paths, never mutating in place.
 *
 * The tradeoff is that accidental mutations in renderer code will corrupt
 * state silently instead of throwing.  This is acceptable because:
 * - TypeScript's `Readonly<T>` return type enforces immutability at
 *   compile time.
 * - React components receive data through selectors, not raw state refs.
 */
export class ClientStateManager<T> {
  private state: T;
  private fallbackState: T;

  constructor(fallbackState: T) {
    this.fallbackState = fallbackState;
    this.state = this.fallbackState;
  }

  public handleMessage(message: Message, onStateChange?: () => void): void {
    if (isStateSyncMessage(message)) {
      this.state = (message.data as any).state as T;
      onStateChange?.();
    } else if (isStatePatchMessage(message)) {
      // O(path_depth) structural sharing instead of Immer's
      // produce/finalize which is O(state_size) per patch.
      const patches = (message.data as any).patch as Patch[];
      this.state = applyPatchesDirect(this.state, patches);
      onStateChange?.();
    }
  }

  public getState(): Readonly<T> {
    return this.state;
  }

  public reset(): void {
    this.state = this.fallbackState;
  }
}
