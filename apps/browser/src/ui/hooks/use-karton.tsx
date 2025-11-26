import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useRef,
  useSyncExternalStore,
  useMemo,
  useCallback,
} from 'react';
import { getBrowserData } from '@/utils';
import { type KartonContract, defaultState } from '@shared/karton-contracts/ui';
import { createKartonClient } from '@stagewise/karton/client';
import type { KartonClient, ElectronBridge } from '@stagewise/karton/client';
import { ElectronClientTransport } from '@stagewise/karton/client';

// Re-export useComparingSelector from the karton package
export { useComparingSelector } from '@stagewise/karton/react/client';

// Declare window.electron type extension for the bridge-based API
declare global {
  interface Window {
    electron: {
      karton: ElectronBridge;
    };
  }
}

/**
 * Client procedures implementation for the UI contract.
 */
const clientProcedures = {
  devAppPreview: {
    getPreviewInfo: async () => {
      const browserData = getBrowserData();
      if (!browserData) throw new Error('Browser data not available.');
      return browserData;
    },
  },
};

/**
 * Context value for the karton provider.
 */
interface KartonContextValue {
  client: KartonClient<KartonContract> | null;
  isReady: boolean;
  error: Error | null;
  subscribe: (listener: () => void) => () => void;
}

/**
 * Context for karton client access.
 */
const KartonContext = createContext<KartonContextValue | null>(null);

/**
 * Provider component that initializes karton and provides the client.
 * This component waits for the MessagePort to be available before
 * making the client available to children.
 */
export function KartonProvider({ children }: { children?: React.ReactNode }) {
  const clientRef = useRef<KartonClient<KartonContract> | null>(null);
  const listenersRef = useRef(new Set<() => void>());
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Create a stable subscribe function
  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        // Wait for the bridge to be ready
        await window.electron.karton.waitForReady();

        if (!mounted) return;

        // Create the transport with the bridge
        const transport = new ElectronClientTransport({
          bridge: window.electron.karton,
        });

        // Create the karton client
        clientRef.current = createKartonClient<KartonContract>({
          transport,
          procedures: clientProcedures,
          fallbackState: defaultState,
          onStateChange: () => {
            // Notify all listeners when state changes
            listenersRef.current.forEach((listener) => listener());
          },
        });

        setIsReady(true);
        // Trigger initial notification
        listenersRef.current.forEach((listener) => listener());
      } catch (err) {
        if (!mounted) return;
        console.error('[Karton] Failed to initialize:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    initialize();

    return () => {
      mounted = false;
      if (clientRef.current) {
        // Client cleanup would go here if needed
        clientRef.current = null;
      }
    };
  }, []);

  const contextValue = useMemo<KartonContextValue>(
    () => ({
      client: clientRef.current,
      isReady,
      error,
      subscribe,
    }),
    [isReady, error, subscribe],
  );

  // Don't render children until karton is connected
  // This prevents any component from trying to make RPC calls before we're ready
  if (error) {
    // Show error state - this shouldn't happen in normal operation
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'system-ui, sans-serif',
          color: '#ef4444',
          padding: '20px',
          textAlign: 'center',
        }}
      >
        <div>
          <div
            style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}
          >
            Connection Error
          </div>
          <div style={{ fontSize: '14px', opacity: 0.8 }}>{error.message}</div>
        </div>
      </div>
    );
  }

  if (!isReady) {
    // Show minimal loading state while connecting
    // This should be very brief since IPC connection is fast
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'system-ui, sans-serif',
          color: '#6b7280',
        }}
      >
        <div style={{ fontSize: '14px' }}>Connecting...</div>
      </div>
    );
  }

  return (
    <KartonContext.Provider value={contextValue}>
      {children}
    </KartonContext.Provider>
  );
}

/**
 * Internal hook to get the karton context.
 */
function useKartonContext(): KartonContextValue {
  const context = useContext(KartonContext);
  if (!context) {
    throw new Error('useKarton* hooks must be used within a KartonProvider');
  }
  return context;
}

/**
 * Hook to check karton initialization state.
 */
export function useKartonInit(): { isReady: boolean; error: Error | null } {
  const { isReady, error } = useKartonContext();
  return { isReady, error };
}

/**
 * Hook to access karton state.
 * Since KartonProvider blocks rendering until connected, client is always available.
 */
export function useKartonState<R = KartonContract['state']>(
  selector?: (state: KartonContract['state']) => R,
): R {
  const { client, subscribe } = useKartonContext();

  const getSnapshot = useCallback(() => {
    // Client is guaranteed to be available
    const state = client!.state;
    return selector ? selector(state) : (state as R);
  }, [client, selector]);

  // Use useSyncExternalStore for proper React 18 integration
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return value;
}

/**
 * Hook to access karton server procedures.
 * Since KartonProvider blocks rendering until connected, client is always available.
 */
export function useKartonProcedure<R = KartonContract['serverProcedures']>(
  selector?: (procedures: KartonContract['serverProcedures']) => R,
): R {
  const { client } = useKartonContext();

  return useMemo(() => {
    // Client is guaranteed to be available since KartonProvider
    // doesn't render children until connected
    const procedures = client!.serverProcedures;
    return selector ? selector(procedures) : (procedures as unknown as R);
  }, [client, selector]);
}

/**
 * Hook to check if karton is connected to the server.
 * Since KartonProvider blocks rendering until connected, this will always be true initially.
 */
export function useKartonConnected(): boolean {
  const { client, subscribe } = useKartonContext();

  const getSnapshot = useCallback(() => {
    // Client is guaranteed to be available
    return client!.isConnected;
  }, [client]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
