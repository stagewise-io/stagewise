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
      workspace: {
        path: '',
        devAppStatus: null,
        agentChat: {
          activeChatId: null,
          chats: {},
          toolCallApprovalRequests: [],
          isWorking: false,
        },
        config: {
          appPort: 0,
          eddyMode: undefined,
          autoPlugins: false,
          plugins: [],
        },
        plugins: [],
      },
      workspaceStatus: 'closed',
      userAccount: {
        status: 'unauthenticated',
        loginDialog: null,
        subscription: undefined,
        tokenExpiresAt: undefined,
        refreshTokenExpiresAt: undefined,
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
      filePicker: {
        title: '',
        description: '',
        mode: 'file',
        multiple: false,
        currentPath: '',
        parentSiblings: [],
        children: [],
      },
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
