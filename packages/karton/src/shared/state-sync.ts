import {
  produce,
  freeze,
  enablePatches,
  applyPatches,
  type Patch,
} from 'immer';
import type { Draft } from 'immer';
import type { WebSocketMessage } from './types.js';
import {
  createStateSyncMessage,
  createStatePatchMessage,
  isStateSyncMessage,
  isStatePatchMessage,
} from './websocket-messages.js';

// Enable Immer patches globally
enablePatches();

export class StateManager<T> {
  private state: T;
  private broadcast: (message: WebSocketMessage) => void;

  constructor(initialState: T, broadcast: (message: WebSocketMessage) => void) {
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

    // Only update and broadcast if there were actual changes
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

  public getFullStateSyncMessage(): WebSocketMessage {
    return createStateSyncMessage(this.state);
  }
}

export class ClientStateManager<T> {
  private state: T;
  private fallbackState: T;

  constructor(fallbackState: T) {
    this.fallbackState = freeze(fallbackState as any, true) as T;
    this.state = this.fallbackState;
  }

  public handleMessage(
    message: WebSocketMessage,
    onStateChange?: () => void,
  ): void {
    if (isStateSyncMessage(message)) {
      // Full state sync - replace entire state
      this.state = freeze((message.data as any).state as any, true) as T;
      onStateChange?.();
    } else if (isStatePatchMessage(message)) {
      // Apply patches to current state
      const patches = (message.data as any).patch as Patch[];
      const newState = applyPatches(this.state as any, patches);
      this.state = freeze(newState as any, true) as T;
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
