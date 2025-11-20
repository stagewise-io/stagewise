import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ChatBubble } from './chat-bubble';
import { withMockKarton } from '../../../../../../../.storybook/decorators/with-mock-karton';
import { withStreamingMessage } from '../../../../../../../.storybook/decorators/with-streaming-message';
import {
  createUserMessage,
  createAssistantMessage,
  createOverwriteFileToolPart,
  createReadFileToolPart,
  createFilePart,
} from '../../../../../../../.storybook/mocks/chat-data';
import { createStreamingConfig } from '../../../../../../../.storybook/mocks/streaming-configs';
import { useKartonState } from '@/hooks/use-karton';
import type { AppState } from '@stagewise/karton-contract';
import { Layout } from '@stagewise/karton-contract';

const meta = {
  title: 'Toolbar/Chat/ChatBubble',
  component: ChatBubble,
  decorators: [
    withMockKarton,
    (Story) => (
      <div className="w-[400px] space-y-4 rounded-lg border border-zinc-200 bg-background p-4 dark:border-zinc-800">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'centered',
    mockKartonState: {
      globalConfig: {
        openFilesInIde: 'vscode',
      },
      workspace: {
        agent: {
          accessPath: '/mock/workspace/path',
        },
        agentChat: {
          activeChatId: 'mock-chat-id',
          chats: {},
          toolCallApprovalRequests: [],
          isWorking: false,
        },
      },
      workspaceStatus: 'open' as const,
      userExperience: {
        activeLayout: Layout.MAIN,
      },
    } as unknown as Partial<AppState>,
  },
} satisfies Meta<typeof ChatBubble>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UserMessageSimple: Story = {
  args: {
    message: createUserMessage('Can you help me fix this bug?'),
    isLastMessage: true,
  },
};

export const UserMessageLong: Story = {
  args: {
    message: createUserMessage(
      'I need help with a complex issue. My React component is not rendering correctly when I pass props from the parent component. It seems to work fine in development but breaks in production. Can you help me debug this?',
    ),
    isLastMessage: true,
  },
};

export const AssistantMessageSimple: Story = {
  args: {
    message: createAssistantMessage(
      "Of course! I'd be happy to help you fix that bug. Can you share more details about what's happening?",
    ),
    isLastMessage: true,
  },
};

export const AssistantMessageLong: Story = {
  args: {
    message: createAssistantMessage(
      "I can help you with that. Based on your description, it sounds like you might be encountering a hydration mismatch. This typically happens when the server-rendered HTML doesn't match what React expects on the client side. Let me explain the common causes and solutions:\n\n1. Check if you're using browser-only APIs during SSR\n2. Verify that your date/time formatting is consistent\n3. Make sure random values are seeded properly\n\nLet me take a look at your code to identify the exact issue.",
    ),
    isLastMessage: true,
  },
};

export const AssistantWithToolCall: Story = {
  args: {
    message: createAssistantMessage("I'll update the component for you.", {
      toolParts: [
        createOverwriteFileToolPart(
          'src/components/Button.tsx',
          `export const Button = ({ children, isLoading, ...props }) => {
  return (
    <button disabled={isLoading} {...props}>
      {isLoading ? 'Loading...' : children}
    </button>
  );
};`,
          'complete',
          `export const Button = ({ children, ...props }) => {
  return <button {...props}>{children}</button>;
};`,
        ),
      ],
    }),
    isLastMessage: true,
  },
};

export const AssistantWithMultipleToolCalls: Story = {
  args: {
    message: createAssistantMessage(
      'Let me check the current implementation and then update it.',
      {
        toolParts: [
          createReadFileToolPart(
            'src/components/Header.tsx',
            'export const Header = () => <header>Old Header</header>;',
          ),
          createOverwriteFileToolPart(
            'src/components/Header.tsx',
            `export const Header = () => {
  return (
    <header className="w-full px-4 md:px-8">
      <h1 className="text-xl font-bold">Updated Header</h1>
    </header>
  );
};`,
            'complete',
            'export const Header = () => <header>Old Header</header>;',
          ),
        ],
      },
    ),
    isLastMessage: true,
  },
};

export const UserMessageWithAttachment: Story = {
  args: {
    message: createUserMessage('Can you review this screenshot?', {
      fileAttachments: [
        createFilePart('screenshot.png', 'image/png', 'data:image/png;base64,'),
      ],
    }),
    isLastMessage: true,
  },
};

export const StreamingMessage: Story = {
  args: {
    message: createAssistantMessage('Let me help you with that. I'),
    isLastMessage: true,
  },
  parameters: {
    mockKartonState: {
      globalConfig: {
        openFilesInIde: 'vscode',
      },
      workspace: {
        agent: {
          accessPath: '/mock/workspace/path',
        },
        agentChat: {
          activeChatId: 'mock-chat-id',
          chats: {},
          toolCallApprovalRequests: [],
          isWorking: true,
        },
      },
      workspaceStatus: 'open' as const,
      userExperience: {
        activeLayout: Layout.MAIN,
      },
    } as any,
  },
};

export const NotLastMessage: Story = {
  args: {
    message: createAssistantMessage(
      'This is a middle message in the conversation.',
    ),
    isLastMessage: false,
  },
};

export const MultipleMessagesComparison: Story = {
  args: {
    message: createUserMessage('Placeholder'),
    isLastMessage: false,
  },
  render: () => (
    <>
      <ChatBubble
        message={createUserMessage('First user message')}
        isLastMessage={false}
      />
      <ChatBubble
        message={createAssistantMessage('First assistant response')}
        isLastMessage={false}
      />
      <ChatBubble
        message={createUserMessage('Second user message')}
        isLastMessage={false}
      />
      <ChatBubble
        message={createAssistantMessage(
          'Second assistant response with a tool call',
          {
            toolParts: [
              createOverwriteFileToolPart(
                'example.ts',
                `export function greet(name: string) {
  console.log(\`Hello, \${name}!\`);
}`,
                'complete',
                'console.log("updated");',
              ),
            ],
          },
        )}
        isLastMessage={true}
      />
    </>
  ),
};

export const StreamingSimulation: Story = {
  args: {
    message: createAssistantMessage(''),
    isLastMessage: true,
  },
  decorators: [
    withStreamingMessage,
    (Story) => (
      <div className="w-[400px] space-y-4 rounded-lg border border-zinc-200 bg-background p-4 dark:border-zinc-800">
        <Story />
      </div>
    ),
  ],
  render: () => {
    const message = useKartonState((s: any) => {
      const chatId = s.workspace?.agentChat?.activeChatId || 'streaming-chat';
      const messages = s.workspace?.agentChat?.chats?.[chatId]?.messages || [];
      return messages.find((m: any) => m.id === 'streaming-msg');
    });

    if (!message) return <div>Loading...</div>;

    return <ChatBubble message={message} isLastMessage={true} />;
  },
  parameters: {
    streamingConfig: createStreamingConfig(
      'streaming-msg',
      "Hey there, I hope you're doing well! What can I help you with today?",
      'normalWord',
    ),
    mockKartonState: {
      globalConfig: {
        openFilesInIde: 'vscode',
      },
      workspace: {
        agent: {
          accessPath: '/mock/workspace/path',
        },
        agentChat: {
          activeChatId: 'streaming-chat',
          chats: {
            'streaming-chat': {
              title: 'Streaming Demo',
              messages: [createAssistantMessage('', { id: 'streaming-msg' })],
              usage: { maxContextWindowSize: 200000, usedContextWindowSize: 0 },
            },
          },
          toolCallApprovalRequests: [],
          isWorking: true,
        },
      },
      workspaceStatus: 'open' as const,
      userExperience: {
        activeLayout: Layout.MAIN,
      },
    } as unknown as Partial<AppState>,
  },
};

export const StreamingLongResponse: Story = {
  args: {
    message: createAssistantMessage(''),
    isLastMessage: true,
  },
  decorators: [
    withStreamingMessage,
    (Story) => (
      <div className="w-[400px] space-y-4 rounded-lg border border-zinc-200 bg-background p-4 dark:border-zinc-800">
        <Story />
      </div>
    ),
  ],
  render: () => {
    const message = useKartonState((s: any) => {
      const chatId = s.workspace?.agentChat?.activeChatId || 'streaming-chat';
      const messages = s.workspace?.agentChat?.chats?.[chatId]?.messages || [];
      return messages.find((m: any) => m.id === 'streaming-long-msg');
    });

    if (!message) return <div>Loading...</div>;

    return <ChatBubble message={message} isLastMessage={true} />;
  },
  parameters: {
    streamingConfig: createStreamingConfig(
      'streaming-long-msg',
      `I'll help you fix that bug. Let me analyze the code first.

After reviewing the component, I found a few issues:
- The state update isn't batched properly
- There's a missing dependency in the useEffect
- The error boundary isn't catching async errors

I'll update the code to fix these issues now.`,
      'normalWord',
    ),
    mockKartonState: {
      globalConfig: {
        openFilesInIde: 'vscode',
      },
      workspace: {
        agent: {
          accessPath: '/mock/workspace/path',
        },
        agentChat: {
          activeChatId: 'streaming-chat',
          chats: {
            'streaming-chat': {
              title: 'Streaming Long Response',
              messages: [
                createAssistantMessage('', { id: 'streaming-long-msg' }),
              ],
              usage: { maxContextWindowSize: 200000, usedContextWindowSize: 0 },
            },
          },
          toolCallApprovalRequests: [],
          isWorking: true,
        },
      },
      workspaceStatus: 'open' as const,
      userExperience: {
        activeLayout: Layout.MAIN,
      },
    } as unknown as Partial<AppState>,
  },
};

export const StreamingFastCharacters: Story = {
  args: {
    message: createAssistantMessage(''),
    isLastMessage: true,
  },
  decorators: [
    withStreamingMessage,
    (Story) => (
      <div className="w-[400px] space-y-4 rounded-lg border border-zinc-200 bg-background p-4 dark:border-zinc-800">
        <Story />
      </div>
    ),
  ],
  render: () => {
    const message = useKartonState((s: any) => {
      const chatId = s.workspace?.agentChat?.activeChatId || 'streaming-chat';
      const messages = s.workspace?.agentChat?.chats?.[chatId]?.messages || [];
      return messages.find((m: any) => m.id === 'streaming-fast-msg');
    });

    if (!message) return <div>Loading...</div>;

    return <ChatBubble message={message} isLastMessage={true} />;
  },
  parameters: {
    streamingConfig: createStreamingConfig(
      'streaming-fast-msg',
      'This is a fast character-by-character streaming example!',
      'fastChar',
    ),
    mockKartonState: {
      globalConfig: {
        openFilesInIde: 'vscode',
      },
      workspace: {
        agent: {
          accessPath: '/mock/workspace/path',
        },
        agentChat: {
          activeChatId: 'streaming-chat',
          chats: {
            'streaming-chat': {
              title: 'Fast Streaming',
              messages: [
                createAssistantMessage('', { id: 'streaming-fast-msg' }),
              ],
              usage: { maxContextWindowSize: 200000, usedContextWindowSize: 0 },
            },
          },
          toolCallApprovalRequests: [],
          isWorking: true,
        },
      },
      workspaceStatus: 'open' as const,
      userExperience: {
        activeLayout: Layout.MAIN,
      },
    } as unknown as Partial<AppState>,
  },
};
