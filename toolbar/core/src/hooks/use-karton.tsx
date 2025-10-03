import type { KartonContract } from '@stagewise/karton-contract';
import {
  createKartonReactClient,
  useComparingSelector,
} from '@stagewise/karton/react/client';

const [KartonProvider, useKartonState, useKartonProcedure, useKartonConnected] =
  createKartonReactClient<KartonContract>({
    webSocketPath: `${window.location.protocol}//${window.location.host}/stagewise-toolbar-app/karton`,
    procedures: {
      getAvailableTools: async () => [],
    },
    fallbackState: {
      workspace: null,
      workspaceStatus: 'closed',
      userAccount: {
        status: 'unauthenticated' as const,
        loginDialog: null,
      },
      appInfo: {
        bridgeMode: false,
        envMode: 'production',
        verbose: false,
        version: 'UNKNOWN',
        runningOnPort: 0,
      },
      globalConfig: {
        telemetryLevel: 'off',
      },
      userExperience: {},
      filePicker: null,
      notifications: [],
    },
  });

export {
  KartonProvider,
  useKartonState,
  useKartonProcedure,
  useKartonConnected,
  useComparingSelector,
};
