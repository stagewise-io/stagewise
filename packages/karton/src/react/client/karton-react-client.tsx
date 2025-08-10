import React, {
  createContext,
  useContext,
  useRef,
  useSyncExternalStore,
  useCallback,
} from 'react';
import { createKartonClient } from '../../client/karton-client.js';
import type {
  KartonClient,
  KartonClientConfig,
  KartonState,
  KartonServerProcedures,
} from '../../shared/types.js';

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

export function createKartonReactClient<T>(
  config: KartonClientConfig<T>,
): [
  React.FC<{ children?: React.ReactNode }>,
  <R>(
    selector: (data: {
      state: Readonly<KartonState<T>>;
      serverProcedures: KartonServerProcedures<T>;
      isConnected: boolean;
    }) => R,
  ) => R,
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
      clientRef.current = createKartonClient(config);

      // Create subscription manager
      subscribeRef.current = (listener: () => void) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      };

      // Monitor state changes
      // In a real implementation, we'd need to add state change events to the client
      // For now, we'll poll for changes
      const checkForChanges = () => {
        listenersRef.current.forEach((listener) => listener());
      };

      // Poll for changes every 100ms
      // This is a simplified approach - in production, we'd use proper event emitters
      setInterval(checkForChanges, 100);
    }

    const value: KartonContextValue<T> = {
      client: clientRef.current,
      subscribe: subscribeRef.current!,
    };

    return (
      <KartonContext.Provider value={value}>{children}</KartonContext.Provider>
    );
  };

  const useKarton = <R,>(
    selector: (data: {
      state: Readonly<KartonState<T>>;
      serverProcedures: KartonServerProcedures<T>;
      isConnected: boolean;
    }) => R,
  ): R => {
    const context = useContext(KartonContext);

    if (!context) {
      throw new Error('useKarton must be used within KartonProvider');
    }

    const { client, subscribe } = context;

    // Create stable selector data reference
    const selectorDataRef = useRef<
      | {
          state: Readonly<KartonState<T>>;
          serverProcedures: KartonServerProcedures<T>;
          isConnected: boolean;
        }
      | undefined
    >(undefined);
    const selectedValueRef = useRef<R | undefined>(undefined);

    const getSnapshot = useCallback(() => {
      const data: {
        state: Readonly<KartonState<T>>;
        serverProcedures: KartonServerProcedures<T>;
        isConnected: boolean;
      } = {
        state: client.state,
        serverProcedures: client.serverProcedures,
        isConnected: client.isConnected,
      };

      // Only create new object if data changed
      if (
        !selectorDataRef.current ||
        selectorDataRef.current.state !== data.state ||
        selectorDataRef.current.isConnected !== data.isConnected
      ) {
        selectorDataRef.current = data;
        // Re-run selector only when data changes
        selectedValueRef.current = selector(selectorDataRef.current);
      }

      return selectedValueRef.current!;
    }, [client]); // Remove selector from deps to avoid recreating

    // Use React's built-in store subscription hook
    const selectedValue = useSyncExternalStore(
      subscribe,
      getSnapshot,
      getSnapshot, // Server snapshot is same as client
    );

    return selectedValue;
  };

  return [KartonProvider, useKarton];
}
