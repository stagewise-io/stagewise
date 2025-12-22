import {
  type PagesApiContract,
  defaultState,
} from '@shared/karton-contracts/pages-api';
import {
  createKartonReactClient,
  useComparingSelector,
} from '@stagewise/karton/react/client';
import {
  ElectronClientTransport,
  type MessagePortProxy,
} from '@stagewise/karton/client';
import { useEffect, useState } from 'react';

declare global {
  interface Window {
    stagewisePagesApi: {
      portProxy: MessagePortProxy;
    };
  }
}
const [KartonProvider, useKartonState, useKartonProcedure, useKartonConnected] =
  createKartonReactClient<PagesApiContract>({
    transport: new ElectronClientTransport({
      messagePort: window.stagewisePagesApi.portProxy,
    }),
    procedures: {},
    fallbackState: defaultState,
  });

/**
 * Hook to track Karton reconnection state
 * Listens to 'karton-reconnect' events dispatched from the preload script
 */
export function useKartonReconnectState() {
  const [reconnectState, setReconnectState] = useState<{
    isReconnecting: boolean;
    attempt: number;
    failed: boolean;
  }>({
    isReconnecting: false,
    attempt: 0,
    failed: false,
  });

  useEffect(() => {
    const handleReconnectEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        type: 'reconnecting' | 'reconnected' | 'failed';
        attempt?: number;
      }>;

      const { type, attempt = 0 } = customEvent.detail;

      switch (type) {
        case 'reconnecting':
          setReconnectState({
            isReconnecting: true,
            attempt,
            failed: false,
          });
          break;
        case 'reconnected':
          setReconnectState({
            isReconnecting: false,
            attempt: 0,
            failed: false,
          });
          break;
        case 'failed':
          setReconnectState({
            isReconnecting: false,
            attempt,
            failed: true,
          });
          break;
      }
    };

    window.addEventListener('karton-reconnect', handleReconnectEvent);

    return () => {
      window.removeEventListener('karton-reconnect', handleReconnectEvent);
    };
  }, []);

  return reconnectState;
}

export {
  KartonProvider,
  useKartonState,
  useKartonProcedure,
  useKartonConnected,
  useComparingSelector,
};
