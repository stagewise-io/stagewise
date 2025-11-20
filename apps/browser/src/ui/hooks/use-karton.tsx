import { getBrowserData } from '@/utils';
import { type KartonContract, defaultState } from '@stagewise/karton-contract';
import {
  createKartonReactClient,
  useComparingSelector,
} from '@stagewise/karton/react/client';
import { ElectronClientTransport } from '@stagewise/karton/client';

// Declare window.electron type extension
declare global {
  interface Window {
    electron: {
      karton: {
        send(channel: string, ...args: any[]): void;
        on(
          channel: string,
          listener: (event: any, ...args: any[]) => void,
        ): () => void;
        removeListener(
          channel: string,
          listener: (...args: any[]) => void,
        ): void;
      };
    };
  }
}

const [KartonProvider, useKartonState, useKartonProcedure, useKartonConnected] =
  createKartonReactClient<KartonContract>({
    transport: new ElectronClientTransport({
      bridge: window.electron.karton,
      channel: 'karton',
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

export {
  KartonProvider,
  useKartonState,
  useKartonProcedure,
  useKartonConnected,
  useComparingSelector,
};
