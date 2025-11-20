import type { Meta, StoryObj } from '@storybook/react';
import { ChatHistory } from './chat-history';
import { withMockKarton } from '../../../../../../../.storybook/decorators/with-mock-karton';
import {
  createEmptyChat,
  createSimpleChat,
  createChatWithManyMessages,
  createStreamingChat,
  createChatWithToolCalls,
  createChatWithError,
  createChatWithFileAttachments,
  generateId,
} from '../../../../../../../.storybook/mocks/chat-data';
import type { AppState } from '@stagewise/karton-contract';
import { Layout, MainTab } from '@stagewise/karton-contract';

const meta = {
  title: 'Toolbar/Chat/ChatHistory',
  component: ChatHistory,
  decorators: [
    withMockKarton,
    (Story) => (
      <div className="h-[600px] w-[400px] overflow-hidden rounded-lg border border-zinc-200 bg-background dark:border-zinc-800">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ChatHistory>;

export default meta;
type Story = StoryObj<typeof meta>;

// Helper to create workspace state with a chat
function createWorkspaceWithChat(chat: ReturnType<typeof createSimpleChat>) {
  const chatId = generateId();
  return {
    workspace: {
      path: '/mock/workspace',
      paths: {
        data: '/mock/data',
        cache: '/mock/cache',
        temp: '/mock/temp',
      },
      devAppStatus: null,
      agent: {
        accessPath: '/mock/workspace',
      },
      agentChat: {
        activeChatId: chatId,
        chats: {
          [chatId]: chat,
        },
        toolCallApprovalRequests: [],
        isWorking: false,
      },
      inspirationComponents: [],
      config: null,
      plugins: null,
      setupActive: false,
      rag: {
        lastIndexedAt: null,
        indexedFiles: 0,
        statusInfo: { isIndexing: false },
      },
      loadedOnStart: true,
      childWorkspacePaths: [],
    },
    workspaceStatus: 'open' as const,
    userExperience: {
      activeLayout: Layout.MAIN,
      activeMainTab: MainTab.DEV_APP_PREVIEW,
      devAppPreview: {
        isFullScreen: false,
        inShowCodeMode: false,
        customScreenSize: null,
      },
    },
  } as Partial<AppState>;
}

export const Empty: Story = {
  parameters: {
    mockKartonState: createWorkspaceWithChat(createEmptyChat()),
  },
};

export const SimpleConversation: Story = {
  parameters: {
    mockKartonState: createWorkspaceWithChat(createSimpleChat()),
  },
};

export const ManyMessages: Story = {
  parameters: {
    mockKartonState: createWorkspaceWithChat(createChatWithManyMessages()),
  },
};

export const StreamingResponse: Story = {
  parameters: {
    mockKartonState: {
      ...createWorkspaceWithChat(createStreamingChat()),
      workspace: {
        ...createWorkspaceWithChat(createStreamingChat()).workspace,
        agentChat: {
          ...createWorkspaceWithChat(createStreamingChat()).workspace
            ?.agentChat,
          isWorking: true,
        },
      },
    } as Partial<AppState>,
  },
};

export const WithToolCalls: Story = {
  parameters: {
    mockKartonState: createWorkspaceWithChat(createChatWithToolCalls()),
  },
};

export const WithError: Story = {
  parameters: {
    mockKartonState: createWorkspaceWithChat(createChatWithError()),
  },
};

export const WithFileAttachments: Story = {
  parameters: {
    mockKartonState: createWorkspaceWithChat(createChatWithFileAttachments()),
  },
};

export const AgentWorking: Story = {
  parameters: {
    mockKartonState: {
      ...createWorkspaceWithChat(createSimpleChat()),
      workspace: {
        ...createWorkspaceWithChat(createSimpleChat()).workspace,
        agentChat: {
          ...createWorkspaceWithChat(createSimpleChat()).workspace?.agentChat,
          isWorking: true,
        },
      },
    } as Partial<AppState>,
  },
};
