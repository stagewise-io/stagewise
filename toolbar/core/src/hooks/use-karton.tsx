import type { KartonContract } from '@stagewise/karton-contract';
import { createKartonReactClient } from '@stagewise/karton/react/client';

const [KartonProvider, useKarton] = createKartonReactClient<KartonContract>({
  webSocketPath: `${window.location.protocol}//${window.location.host}/stagewise-toolbar-app/karton`,
  procedures: {
    getAvailableTools: async () => [],
  },
  fallbackState: {
    chats: {},
    activeChatId: '',
    isWorking: false,
    toolCallApprovalRequests: [],
  },
});

export { KartonProvider, useKarton };
