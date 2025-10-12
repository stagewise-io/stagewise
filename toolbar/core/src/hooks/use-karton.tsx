import { getIFrameWindow } from '@/utils';
import { type KartonContract, defaultState } from '@stagewise/karton-contract';
import {
  createKartonReactClient,
  useComparingSelector,
} from '@stagewise/karton/react/client';

const [KartonProvider, useKartonState, useKartonProcedure, useKartonConnected] =
  createKartonReactClient<KartonContract>({
    webSocketPath: `${window.location.protocol}//${window.location.host}/stagewise-toolbar-app/karton`,
    procedures: {
      devAppPreview: {
        getPreviewInfo: async () => {
          const iframe = getIFrameWindow();

          if (!iframe) {
            throw new Error('Iframe not found');
          }

          return {
            viewport: {
              width: iframe.innerWidth,
              height: iframe.innerHeight,
              dpr: iframe.devicePixelRatio,
            },
            currentUrl: iframe.location.href,
            currentTitle: iframe.document.title,
            userAgent: iframe.navigator.userAgent,
            locale: iframe.navigator.language,
            prefersDarkMode: iframe.matchMedia('(prefers-color-scheme: dark)')
              .matches,
          };
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
