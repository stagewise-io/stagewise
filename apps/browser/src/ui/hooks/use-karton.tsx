import { getBrowserData } from '@/utils';
import { type KartonContract, defaultState } from '@shared/karton-contracts/ui';
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
    electron: {
      karton: { portProxy: MessagePortProxy };
      syncThemeColors: (colors: {
        isDark: boolean;
        theme: {
          background: string;
          titleBarOverlay: {
            color: string;
            symbolColor: string;
          };
        };
      }) => void;
    };
  }
}
const [KartonProvider, useKartonState, useKartonProcedure, useKartonConnected] =
  createKartonReactClient<KartonContract>({
    transport: new ElectronClientTransport({
      messagePort: window.electron.karton.portProxy,
    }),
    procedures: {
      devAppPreview: {
        getPreviewInfo: async () => {
          const browserData = getBrowserData();
          if (!browserData) throw new Error('Browser data not available.');
          return browserData;
        },
      },
    },
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
