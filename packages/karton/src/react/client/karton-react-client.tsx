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
} from '../../shared/types.js';
import { shallow } from '../comparators.js';

interface KartonContextValue<T> {
  client: KartonClient<T>;
  subscribe: (listener: () => void) => () => void;
}

export interface SelectorData<T> {
  state: Readonly<KartonState<T>>;
  serverProcedures: KartonServerProcedures<T>;
  isConnected: boolean;
}

function createKartonContext<T>() {
  return createContext<KartonContextValue<T> | null>(null);
}

// Return true if a and b are equal, false otherwise
export type EqualityFn<T> = (a: T, b: T) => boolean;

export type StateSelector<T, R> = (state: Readonly<KartonState<T>>) => R;
export type ProcedureSelector<T, R> = (
  procedures: KartonServerProcedures<T>,
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

  const KartonProvider: React.FC<{ children?: React.ReactNode }> = ({
    children,
  }) => {
    const clientRef = useRef<KartonClient<T> | null>(null);
    const listenersRef = useRef(new Set<() => void>());
    const subscribeRef = useRef<((listener: () => void) => () => void) | null>(
      null,
    );

    if (!clientRef.current) {
      clientRef.current = createKartonClient({
        ...config,
        onStateChange: () => {
          listenersRef.current.forEach((listener) => listener());
        },
      });

      // Create a stable subscribe function only once
      subscribeRef.current = (listener: () => void) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      };
    }

    const client = clientRef.current;

    // Memoize the context value to prevent unnecessary re-renders
    const value = useMemo<KartonContextValue<T>>(
      () => ({
        client,
        subscribe: subscribeRef.current!,
      }),
      [client], // Only recreate if client changes (which should never happen)
    );

    return (
      <KartonContext.Provider value={value}>{children}</KartonContext.Provider>
    );
  };

  const useKartonState = <R = KartonState<T>>(
    selector: StateSelector<T, R> = fullStateSelector as any,
  ): R => {
    const context = useContext(KartonContext);

    if (!context) {
      throw new Error('useKartonState must be used within KartonProvider');
    }

    const { client, subscribe } = context;

    // Use React's built-in store subscription hook
    const selectedValue = useSyncExternalStore(
      subscribe,
      useCallback(() => selector(client.state), [selector, client.state]),
      useCallback(
        () => selector(config.fallbackState),
        [selector, config.fallbackState],
      ),
    );

    return selectedValue;
  };

  const useKartonProcedure = <R = KartonServerProcedures<T>>(
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
