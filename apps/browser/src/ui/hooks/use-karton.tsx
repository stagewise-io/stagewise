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

declare global {
  interface Window {
    electron: {
      karton: { portProxy: MessagePortProxy };
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

export {
  KartonProvider,
  useKartonState,
  useKartonProcedure,
  useKartonConnected,
  useComparingSelector,
};
