import type { Meta, StoryObj } from '@storybook/react';
import { ChatHistory } from '../../chat-history';
import { withFileEditScenario } from '../../../../../../../../../.storybook/decorators/scenarios';
import { withMockKarton } from '../../../../../../../../../.storybook/decorators/with-mock-karton';
import { type AppState, Layout } from '@stagewise/karton-contract';
import { MainTab } from '@stagewise/karton-contract';
import {
  createUserMessage,
  createAssistantMessage,
  createThinkingPart,
  createReadFileToolPart,
  createEmptyChat,
} from '../../../../../../../../../.storybook/mocks/chat-data';

const meta: Meta<typeof ChatHistory> = {
  title: 'Chat/Agent/Messages',
  component: ChatHistory,
  tags: ['autodocs'],
  decorators: [withMockKarton],
};

export default meta;
type Story = StoryObj<typeof ChatHistory>;

const baseState: Partial<AppState> = {
  workspace: {
    agent: {
      accessPath: '/Users/user/projects/my-app',
    },
    childWorkspacePaths: [],
    path: '/Users/user/projects/my-app',
    paths: {
      data: '/Users/user/projects/my-app/data',
      cache: '/Users/user/projects/my-app/cache',
      temp: '/Users/user/projects/my-app/temp',
    },
    devAppStatus: null,
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
    agentChat: {
      chats: {
        'chat-1': createEmptyChat(),
      },
      activeChatId: 'chat-1',
      toolCallApprovalRequests: [],
      isWorking: false,
    },
  },
  userExperience: {
    activeLayout: Layout.MAIN,
    activeMainTab: MainTab.DEV_APP_PREVIEW,
    devAppPreview: {
      isFullScreen: false,
      inShowCodeMode: false,
      customScreenSize: null,
    },
  },
};

/**
 * Simple User Message
 *
 * Basic user message with text-only content.
 * Demonstrates the simplest form of user interaction.
 */
export const UserSimpleText: Story = {
  name: 'User / Simple Text',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
        agentChat: {
          ...baseState.workspace?.agentChat,
          chats: {
            'chat-1': {
              ...createEmptyChat(),
              messages: [
                createUserMessage(
                  'Can you help me add a loading state to my Button component?',
                ),
              ],
            },
          },
        },
      },
    },
  },
};

/**
 * Assistant Read File Complete
 *
 * Full conversation showing agent reading a file and providing analysis.
 * Demonstrates: User ask → Agent think → Read file tool (output-available) → Agent explain
 */
export const AssistantReadFileComplete: Story = {
  name: 'Assistant / Read File Complete',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
        agentChat: {
          ...baseState.workspace?.agentChat,
          chats: {
            'chat-1': {
              ...createEmptyChat(),
              messages: [
                createUserMessage('What does the Button component do?'),
                createAssistantMessage(
                  'Let me read that file to understand its implementation.',
                  {
                    thinkingPart: createThinkingPart(
                      'I need to read the Button component file to analyze its functionality...',
                      'done',
                    ),
                    toolParts: [
                      createReadFileToolPart(
                        'src/components/Button.tsx',
                        `export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  isLoading?: boolean;
}

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  isLoading = false
}: ButtonProps) => {
  return (
    <button
      className={\`btn btn-\${variant} btn-\${size}\`}
      onClick={onClick}
      disabled={isLoading}
    >
      {isLoading ? 'Loading...' : children}
    </button>
  );
};`,
                        'complete',
                      ),
                    ],
                  },
                ),
                createAssistantMessage(
                  'The Button component is a reusable UI element with the following features:\n\n- **Variants**: primary, secondary, or ghost styling\n- **Sizes**: small, medium, or large\n- **Loading state**: Shows "Loading..." text and disables interaction when isLoading is true\n- **Click handler**: Optional onClick callback\n\nIt applies CSS classes based on variant and size, and includes built-in loading state management.',
                ),
              ],
            },
          },
        },
      },
    },
  },
};

/**
 * Assistant Edit File Streaming
 *
 * Shows complete agent workflow with realistic streaming behavior.
 * Demonstrates: User ask → Agent think → Edit file with streaming → Agent confirm
 * Tool states: input-streaming → input-available → output-available
 */
export const AssistantEditFileStreaming: Story = {
  name: 'Assistant / Edit File Streaming',
  decorators: [withFileEditScenario],
  parameters: {
    fileEditScenario: {
      userMessage: 'Add a disabled prop to the Button component',
      thinkingText:
        'I need to add a disabled prop that prevents interaction with the button...',
      targetFile: 'src/components/Button.tsx',
      beforeContent: `export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
}

export const Button = ({ children, variant = 'primary', onClick }: ButtonProps) => {
  return (
    <button className={\`btn btn-\${variant}\`} onClick={onClick}>
      {children}
    </button>
  );
};`,
      afterContent: `export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
  disabled?: boolean;
}

export const Button = ({ children, variant = 'primary', onClick, disabled }: ButtonProps) => {
  return (
    <button
      className={\`btn btn-\${variant}\`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};`,
      responseText:
        "I've added the disabled prop to your Button component. You can now pass disabled={true} to prevent user interaction.",
    },
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
        agentChat: {
          ...baseState.workspace?.agentChat,
          chats: {
            'streaming-chat': createEmptyChat(),
          },
          activeChatId: 'streaming-chat',
        },
      },
    },
  },
};

/**
 * Assistant Tool Error Recovery
 *
 * Shows error handling when a tool operation fails.
 * Demonstrates: User ask → Agent attempt → Tool fails (output-error) → Agent explain recovery
 */
export const AssistantToolErrorRecovery: Story = {
  name: 'Assistant / Tool Error Recovery',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
        agentChat: {
          ...baseState.workspace?.agentChat,
          chats: {
            'chat-1': {
              ...createEmptyChat(),
              messages: [
                createUserMessage('Can you read the Config.tsx file?'),
                createAssistantMessage('Let me read that file for you.', {
                  thinkingPart: createThinkingPart(
                    'I will read the Config.tsx file...',
                    'done',
                  ),
                  toolParts: [
                    {
                      type: 'tool-readFileTool' as const,
                      toolCallId: 'read-1',
                      state: 'output-error' as const,
                      input: {
                        relative_path: 'src/components/Config.tsx',
                        explanation: 'Reading Config.tsx',
                      },
                      errorText:
                        "ENOENT: no such file or directory, open 'src/components/Config.tsx'",
                    },
                  ],
                }),
                createAssistantMessage(
                  "I encountered an error: the file 'src/components/Config.tsx' doesn't exist in your project.\n\nPossible solutions:\n1. Check if the file path is correct\n2. List the files in src/components/ to find the actual filename\n3. The file might have been moved or renamed\n\nWould you like me to list the files in the components directory to help locate it?",
                ),
              ],
            },
          },
        },
      },
    },
  },
};
