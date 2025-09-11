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
      workspaceInfo: null,
      chats: {},
      activeChatId: '',
      isWorking: false,
      toolCallApprovalRequests: [],
      subscription: undefined,
    },
  });

export {
  KartonProvider,
  useKartonState,
  useKartonProcedure,
  useKartonConnected,
  useComparingSelector,
};
