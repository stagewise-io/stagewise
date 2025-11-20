import { getBrowserData } from '@/utils';
import { type KartonContract, defaultState } from '@stagewise/karton-contract';
import {
  createKartonReactClient,
  useComparingSelector,
} from '@stagewise/karton/react/client';

const [KartonProvider, useKartonState, useKartonProcedure, useKartonConnected] =
  createKartonReactClient<KartonContract>({
    webSocketPath: `http://localhost:3100/stagewise-toolbar-app/karton`,
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
