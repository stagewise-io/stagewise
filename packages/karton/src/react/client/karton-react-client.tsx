import React, {
  createContext,
  useContext,
  useRef,
  useSyncExternalStore,
  useCallback,
  useMemo,
} from 'react';
import { createKartonClient } from '../../client/karton-client.js';
import type {
  KartonClient,
  KartonClientConfig,
  KartonState,
  KartonServerProcedures,
  WithFireAndForget,
} from '../../shared/types.js';
import { shallow } from '../comparators.js';

interface KartonContextValue<T> {
  client: KartonClient<T>;
  subscribe: (listener: () => void) => () => void;
}

export interface SelectorData<T> {
  state: Readonly<KartonState<T>>;
  serverProcedures: WithFireAndForget<KartonServerProcedures<T>>;
  isConnected: boolean;
}

function createKartonContext<T>() {
  return createContext<KartonContextValue<T> | null>(null);
}

// Return true if a and b are equal, false otherwise
export type EqualityFn<T> = (a: T, b: T) => boolean;

export type StateSelector<T, R> = (state: Readonly<KartonState<T>>) => R;
export type ProcedureSelector<T, R> = (
  procedures: WithFireAndForget<KartonServerProcedures<T>>,
) => R;

const fullStateSelector = <T,>(state: T): T => state;
const fullProcedureSelector = <T,>(procedures: T): T => procedures;

export function createKartonReactClient<T>(
  config: Omit<KartonClientConfig<T>, 'onStateChange'>,
): [
  React.FC<{ children?: React.ReactNode }>,
  <R>(selector?: StateSelector<T, R>) => R,
  <R>(selector?: ProcedureSelector<T, R>) => R,
  () => boolean,
] {
  const KartonContext = createKartonContext<T>();

  // Create listeners set at module scope so it survives React remounts (e.g., StrictMode)
  const listeners = new Set<() => void>();

  // Create subscribe function at module scope
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  // Create client at module scope so it survives React remounts (e.g., StrictMode)
  // This prevents the state from resetting to fallbackState on remount

  // Double-buffered notification with persistent cooldown.
  //
  // State machine (4 variables):
  //
  //   IDLE (microtaskScheduled=false, rafCooldown=false)
  //     │  onStateChange()
  //     ▼
  //   MICROTASK_PENDING (microtaskScheduled=true, rafCooldown=false)
  //     │  queueMicrotask fires → notify listeners
  //     ▼
  //   COOLDOWN (microtaskScheduled=false, rafCooldown=true)
  //     │  subsequent onStateChange() → hasDeferredChanges=true (no notify)
  //     │  setTimeout(MIN_COOLDOWN_MS) fires → flushDeferred()
  //     ▼
  //   if hasDeferredChanges: notify → re-enter COOLDOWN
  //   else: → IDLE
  //
  // Why queueMicrotask for the first notification:
  //   Microtasks run before paint, so scroll-position-dependent
  //   components (e.g. react-virtuoso) see updated data in the same
  //   frame. rAF would defer by one frame, causing scroll flicker.
  //
  // Why setTimeout for the cooldown (not rAF):
  //   rAF fires at vSync boundaries which can be as short as 1-2ms
  //   after scheduling. A precise setTimeout ensures the cooldown
  //   window is respected regardless of display refresh rate (60/120Hz).
  let microtaskScheduled = false;
  let rafCooldown = false;
  let hasDeferredChanges = false;
  const MIN_COOLDOWN_MS = 12;

  function flushDeferred() {
    rafCooldown = false;
    if (hasDeferredChanges) {
      hasDeferredChanges = false;
      listeners.forEach((listener) => listener());
      rafCooldown = true;
      setTimeout(flushDeferred, MIN_COOLDOWN_MS);
    }
  }

  const client = createKartonClient({
    ...config,
    onStateChange: () => {
      if (rafCooldown) {
        hasDeferredChanges = true;
        return;
      }
      if (!microtaskScheduled) {
        microtaskScheduled = true;
        queueMicrotask(() => {
          microtaskScheduled = false;
          listeners.forEach((listener) => listener());
          rafCooldown = true;
          setTimeout(flushDeferred, MIN_COOLDOWN_MS);
        });
      }
    },
  });

  const KartonProvider: React.FC<{ children?: React.ReactNode }> = ({
    children,
  }) => {
    // Memoize the context value to prevent unnecessary re-renders
    // Client and subscribe are stable module-level references
    const value = useMemo<KartonContextValue<T>>(
      () => ({
        client,
        subscribe,
      }),
      [], // Empty deps - client and subscribe are stable module-level values
    );

    return (
      <KartonContext.Provider value={value}>{children}</KartonContext.Provider>
    );
  };

  // Overloaded function signatures for better type inference
  function useKartonState(): KartonState<T>;
  function useKartonState<R>(selector: StateSelector<T, R>): R;
  function useKartonState<R = KartonState<T>>(
    selector: StateSelector<T, R> = fullStateSelector as any,
  ): R {
    const context = useContext(KartonContext);

    if (!context) {
      throw new Error('useKartonState must be used within KartonProvider');
    }

    const { client, subscribe } = context;

    const selectorFunc = useCallback(
      () => selector(client.state),
      [selector, client.state],
    );

    // Use React's built-in store subscription hook
    const selectedValue = useSyncExternalStore(
      subscribe,
      selectorFunc,
      selectorFunc,
    );

    return selectedValue;
  }

  const useKartonProcedure = <R = WithFireAndForget<KartonServerProcedures<T>>>(
    selector: ProcedureSelector<T, R> = fullProcedureSelector as any,
  ): R => {
    const context = useContext(KartonContext);

    if (!context) {
      throw new Error('useKartonProcedure must be used within KartonProvider');
    }

    const { client } = context;

    // Memoize the selected procedures to ensure stable references
    // Since procedures are proxies and don't change, we only need to compute once
    const selectedProcedures = useMemo(
      () => selector(client.serverProcedures),
      // Only re-compute if the selector function changes or client changes (which should never happen)
      [selector, client],
    );

    return selectedProcedures;
  };

  const useKartonConnected = (): boolean => {
    const context = useContext(KartonContext);

    if (!context) {
      throw new Error('useKartonConnected must be used within KartonProvider');
    }

    const { client, subscribe } = context;

    // Use React's built-in store subscription hook
    const isConnected = useSyncExternalStore(
      subscribe,
      () => client.isConnected,
      () => client.isConnected,
    );

    return isConnected;
  };

  return [
    KartonProvider,
    useKartonState,
    useKartonProcedure,
    useKartonConnected,
  ];
}

export function useComparingSelector<T, R>(
  selector: StateSelector<T, R>,
  comparator: EqualityFn<R> = shallow,
): StateSelector<T, R> {
  const previousValueRef = useRef<R | null>(null);
  return (state) => {
    const next = selector(state);
    if (
      previousValueRef.current !== null &&
      comparator(previousValueRef.current, next)
    ) {
      return previousValueRef.current;
    }
    previousValueRef.current = next;
    return next;
  };
}
