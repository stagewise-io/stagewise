import type { Meta, StoryObj } from '@storybook/react';
import { ChatHistory } from '../../chat-history';
import { withFileEditScenario } from '@sb/decorators/scenarios';
import { withMockKarton } from '@sb/decorators/with-mock-karton';
import { type AppState, Layout } from '@shared/karton-contracts/ui';
import { MainTab } from '@shared/karton-contracts/ui';
import {
  createUserMessage,
  createAssistantMessage,
  createThinkingPart,
  createReadFileToolPart,
  createGlobToolPart,
  createGrepSearchToolPart,
  createListFilesToolPart,
  createOverwriteFileToolPart,
  createMultiEditToolPart,
  createEmptyChat,
} from '@sb/mocks/chat-data';

const meta: Meta<typeof ChatHistory> = {
  title: 'Agent/Messages',
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
      temp: '/Users/user/projects/my-app/temp',
    },
    config: null,
    plugins: null,
    setupActive: false,
    rag: {
      lastIndexedAt: null,
      indexedFiles: 0,
      statusInfo: { isIndexing: false },
    },
    loadedOnStart: true,
  },
  agentChat: {
    chats: {
      'chat-1': createEmptyChat(),
    },
    activeChatId: 'chat-1',
    toolCallApprovalRequests: [],
    isWorking: false,
  },
  userExperience: {
    activeLayout: Layout.MAIN,
    activeMainTab: MainTab.BROWSING,
    inspirationWebsites: {
      websites: [],
      total: 0,
      seed: '',
    },
    storedExperienceData: {
      recentlyOpenedWorkspaces: [],
      hasSeenOnboardingFlow: false,
    },
    devAppPreview: null,
  },
};

/**
 * Simple User Message
 *
 * Basic user message with text-only content.
 * Demonstrates the simplest form of user interaction.
 */
export const UserSimpleText: Story = {
  name: 'User/Simple Text',
  parameters: {
    mockKartonState: {
      ...baseState,
      agentChat: {
        ...baseState.agentChat,
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
      workspace: {
        ...baseState.workspace,
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
  name: 'Assistant/Tool-ReadFile-Complete',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
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
};

/**
 * Assistant Read File Streaming
 *
 * Shows agent reading a file in streaming state.
 * Demonstrates: User ask → Agent think → Read file (input-streaming)
 */
export const AssistantReadFileStreaming: Story = {
  name: 'Assistant/Tool-ReadFile-Streaming',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('Read the App.tsx file'),
              createAssistantMessage('Let me read that file for you.', {
                thinkingPart: createThinkingPart(
                  'I will read the App.tsx file...',
                  'done',
                ),
                toolParts: [
                  createReadFileToolPart('src/App.tsx', '', 'streaming'),
                ],
              }),
            ],
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
  name: 'Assistant/Tool-EditFile-Streaming',
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
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'streaming-chat': createEmptyChat(),
        },
        activeChatId: 'streaming-chat',
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
  name: 'Assistant/Tool-ReadFile-Error',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
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
};

/**
 * Assistant Delete File Complete
 *
 * Full conversation showing agent deleting a file successfully.
 * Demonstrates: User ask → Agent think → Delete file tool (output-available) → Agent confirm
 */
export const AssistantDeleteFileComplete: Story = {
  name: 'Assistant/Tool-DeleteFile-Complete',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('Delete the old Button.test.tsx file'),
              createAssistantMessage(
                'I will delete the old test file for you.',
                {
                  thinkingPart: createThinkingPart(
                    'I need to delete the Button.test.tsx file...',
                    'done',
                  ),
                  toolParts: [
                    {
                      type: 'tool-deleteFileTool' as const,
                      toolCallId: 'delete-1',
                      state: 'output-available' as const,
                      input: {
                        relative_path: 'src/components/Button.test.tsx',
                      },
                      output: {
                        message: 'File deleted successfully',
                        nonSerializableMetadata: {
                          undoExecute: null as any,
                        },
                        hiddenFromLLM: {
                          diff: {
                            path: 'src/components/Button.test.tsx',
                            before: `import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('applies variant classes', () => {
    render(<Button variant="secondary">Click me</Button>);
    expect(screen.getByRole('button')).toHaveClass('btn-secondary');
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    screen.getByRole('button').click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});`,
                            after: '',
                          },
                        },
                      },
                    },
                  ],
                },
              ),
              createAssistantMessage(
                "I've successfully deleted the Button.test.tsx file. The old test file has been removed from your project.",
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant Delete File Streaming
 *
 * Shows complete agent workflow with streaming deletion.
 * Demonstrates: User ask → Agent think → Delete file with streaming → Agent confirm
 * Tool states: input-streaming → input-available → output-available
 */
export const AssistantDeleteFileStreaming: Story = {
  name: 'Assistant/Tool-DeleteFile-Streaming',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('Remove the deprecated utils.ts file'),
              createAssistantMessage('I will remove the deprecated file.', {
                thinkingPart: createThinkingPart(
                  'The utils.ts file is deprecated and should be removed...',
                  'done',
                ),
                toolParts: [
                  {
                    type: 'tool-deleteFileTool' as const,
                    toolCallId: 'delete-2',
                    state: 'output-available' as const,
                    input: {
                      relative_path: 'src/utils/utils.ts',
                    },
                    output: {
                      message: 'File deleted successfully',
                      hiddenFromLLM: {
                        diff: {
                          path: 'src/utils/utils.ts',
                          before: `/**
 * @deprecated This utility file is no longer maintained.
 * Please use the new utility functions from @/lib/utils instead.
 */

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}`,
                          after: '',
                        },
                      },
                      nonSerializableMetadata: {
                        undoExecute: null as any,
                      },
                    },
                  },
                ],
              }),
              createAssistantMessage(
                "I've successfully removed the deprecated utils.ts file. The file contained old utility functions that have been replaced by the new @/lib/utils module.",
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant Delete File Error
 *
 * Shows error handling when file deletion fails.
 * Demonstrates: User ask → Agent attempt → Tool fails (output-error) → Agent explain issue
 */
export const AssistantDeleteFileError: Story = {
  name: 'Assistant/Tool-DeleteFile-Error',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('Delete the Config.tsx file'),
              createAssistantMessage('Let me delete that file for you.', {
                thinkingPart: createThinkingPart(
                  'I will delete the Config.tsx file...',
                  'done',
                ),
                toolParts: [
                  {
                    type: 'tool-deleteFileTool' as const,
                    toolCallId: 'delete-3',
                    state: 'output-error' as const,
                    input: {
                      relative_path: 'src/components/Config.tsx',
                    },
                    errorText:
                      "ENOENT: no such file or directory, unlink 'src/components/Config.tsx'",
                  },
                ],
              }),
              createAssistantMessage(
                "I encountered an error: the file 'src/components/Config.tsx' doesn't exist and cannot be deleted.\n\nPossible reasons:\n1. The file has already been deleted\n2. The file path is incorrect\n3. The file might have been moved to a different location\n\nWould you like me to search for files with similar names?",
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant Glob Complete
 *
 * Shows agent successfully finding files with a glob pattern.
 * Demonstrates: User ask → Agent think → Glob search (output-available) → Agent explain results
 */
export const AssistantGlobComplete: Story = {
  name: 'Assistant/Tool-Glob-Complete',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage(
                'Find all TypeScript files in the components directory',
              ),
              createAssistantMessage(
                'Let me search for TypeScript files in the components directory.',
                {
                  thinkingPart: createThinkingPart(
                    'I will use glob to find all .tsx and .ts files in src/components...',
                    'done',
                  ),
                  toolParts: [
                    createGlobToolPart(
                      'src/components/**/*.{ts,tsx}',
                      23,
                      'complete',
                    ),
                  ],
                },
              ),
              createAssistantMessage(
                'I found 23 TypeScript files in the components directory:\n\n- Button.tsx, Card.tsx, Header.tsx\n- Form components (Input.tsx, Select.tsx, Checkbox.tsx)\n- Layout components (Container.tsx, Grid.tsx, Stack.tsx)\n- And 14 more files\n\nWould you like me to examine any specific file?',
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant Glob Streaming
 *
 * Shows agent searching with glob pattern in streaming state.
 * Demonstrates: User ask → Agent think → Glob search (input-streaming)
 */
export const AssistantGlobStreaming: Story = {
  name: 'Assistant/Tool-Glob-Streaming',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('Find all test files in the project'),
              createAssistantMessage('Searching for test files...', {
                thinkingPart: createThinkingPart(
                  'I will search for all test files using glob pattern...',
                  'done',
                ),
                toolParts: [
                  createGlobToolPart('**/*.test.{ts,tsx}', 0, 'streaming'),
                ],
              }),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant Glob Error
 *
 * Shows error handling when glob pattern is invalid.
 * Demonstrates: User ask → Agent attempt → Glob fails (output-error) → Agent explain
 */
export const AssistantGlobError: Story = {
  name: 'Assistant/Tool-Glob-Error',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('Find files with pattern [invalid'),
              createAssistantMessage('Let me search for those files.', {
                thinkingPart: createThinkingPart(
                  'I will search using the provided pattern...',
                  'done',
                ),
                toolParts: [createGlobToolPart('[invalid', 0, 'error')],
              }),
              createAssistantMessage(
                "I encountered an error: the glob pattern '[invalid' is invalid.\n\nGlob patterns need to have balanced brackets. Did you mean:\n- `**/invalid*` - to find files containing 'invalid'\n- `**/*.invalid` - to find files with .invalid extension\n\nWould you like me to try one of these patterns instead?",
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant GrepSearch Complete
 *
 * Shows agent successfully searching for text content in files.
 * Demonstrates: User ask → Agent think → Grep search (output-available) → Agent explain results
 */
export const AssistantGrepSearchComplete: Story = {
  name: 'Assistant/Tool-GrepSearch-Complete',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('Search for all TODO comments in the codebase'),
              createAssistantMessage(
                'Let me search for TODO comments across the codebase.',
                {
                  thinkingPart: createThinkingPart(
                    'I will use grep to search for TODO comments...',
                    'done',
                  ),
                  toolParts: [
                    createGrepSearchToolPart('TODO:', 15, 'complete'),
                  ],
                },
              ),
              createAssistantMessage(
                'I found 15 TODO comments across your codebase:\n\n**High Priority:**\n- `src/auth/login.ts:42` - TODO: Add rate limiting\n- `src/api/users.ts:156` - TODO: Implement validation\n\n**Component Improvements:**\n- `src/components/Button.tsx:23` - TODO: Add loading state\n- `src/components/Modal.tsx:67` - TODO: Add animations\n\n...and 11 more. Would you like me to help you tackle any of these?',
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant GrepSearch Streaming
 *
 * Shows agent searching for text content in streaming state.
 * Demonstrates: User ask → Agent think → Grep search (input-streaming)
 */
export const AssistantGrepSearchStreaming: Story = {
  name: 'Assistant/Tool-GrepSearch-Streaming',
  parameters: {
    disableShimmer: false,
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('Find all uses of the deprecated API'),
              createAssistantMessage('Searching for deprecated API usage...', {
                thinkingPart: createThinkingPart(
                  'I will search for calls to the deprecated API...',
                  'done',
                ),
                toolParts: [
                  createGrepSearchToolPart('deprecatedAPI', 0, 'streaming'),
                ],
              }),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant GrepSearch Error
 *
 * Shows error handling when search pattern is invalid.
 * Demonstrates: User ask → Agent attempt → Grep fails (output-error) → Agent explain
 */
export const AssistantGrepSearchError: Story = {
  name: 'Assistant/Tool-GrepSearch-Error',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('Search for files matching regex [unclosed'),
              createAssistantMessage('Let me search for that pattern.', {
                thinkingPart: createThinkingPart(
                  'I will search using the provided regex pattern...',
                  'done',
                ),
                toolParts: [createGrepSearchToolPart('[unclosed', 0, 'error')],
              }),
              createAssistantMessage(
                "I encountered an error: the search pattern '[unclosed' is an invalid regular expression.\n\nRegex patterns need to have balanced brackets and proper syntax. Did you mean:\n- `unclosed` - for a literal text search\n- `\\[unclosed\\]` - to search for the literal text '[unclosed]'\n\nWould you like me to try a corrected pattern?",
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant ListFiles Complete
 *
 * Shows agent successfully listing files in a directory.
 * Demonstrates: User ask → Agent think → List files (output-available) → Agent explain results
 */
export const AssistantListFilesComplete: Story = {
  name: 'Assistant/Tool-ListFiles-Complete',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage(
                'Show me what files are in the components directory',
              ),
              createAssistantMessage(
                'Let me list the files in the components directory.',
                {
                  thinkingPart: createThinkingPart(
                    'I will list all files in src/components...',
                    'done',
                  ),
                  toolParts: [
                    createListFilesToolPart(
                      'src/components',
                      [
                        {
                          relativePath: 'src/components/Button.tsx',
                          name: 'Button.tsx',
                          type: 'file',
                          size: 1245,
                          depth: 0,
                        },
                        {
                          relativePath: 'src/components/Card.tsx',
                          name: 'Card.tsx',
                          type: 'file',
                          size: 987,
                          depth: 0,
                        },
                        {
                          relativePath: 'src/components/Header.tsx',
                          name: 'Header.tsx',
                          type: 'file',
                          size: 2103,
                          depth: 0,
                        },
                        {
                          relativePath: 'src/components/forms',
                          name: 'forms',
                          type: 'directory',
                          depth: 0,
                        },
                        {
                          relativePath: 'src/components/layout',
                          name: 'layout',
                          type: 'directory',
                          depth: 0,
                        },
                      ],
                      'complete',
                    ),
                  ],
                },
              ),
              createAssistantMessage(
                'I found 5 items in the components directory:\n\n**Files (3):**\n- Button.tsx (1.2 KB)\n- Card.tsx (987 B)\n- Header.tsx (2.1 KB)\n\n**Subdirectories (2):**\n- forms/\n- layout/\n\nWould you like me to explore any of these files or directories?',
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant ListFiles Streaming
 *
 * Shows agent listing files in streaming state.
 * Demonstrates: User ask → Agent think → List files (input-streaming)
 */
export const AssistantListFilesStreaming: Story = {
  name: 'Assistant/Tool-ListFiles-Streaming',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage(
                'List all files in the src directory recursively',
              ),
              createAssistantMessage('Listing files recursively...', {
                thinkingPart: createThinkingPart(
                  'I will recursively list all files in the src directory...',
                  'done',
                ),
                toolParts: [
                  createListFilesToolPart('src', [], 'streaming', {
                    recursive: true,
                  }),
                ],
              }),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant ListFiles Error
 *
 * Shows error handling when directory doesn't exist.
 * Demonstrates: User ask → Agent attempt → List files fails (output-error) → Agent explain
 */
export const AssistantListFilesError: Story = {
  name: 'Assistant/Tool-ListFiles-Error',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('List files in the nonexistent directory'),
              createAssistantMessage('Let me list those files.', {
                thinkingPart: createThinkingPart(
                  'I will list files in the specified directory...',
                  'done',
                ),
                toolParts: [
                  {
                    type: 'tool-listFilesTool' as const,
                    toolCallId: 'list-1',
                    state: 'output-error' as const,
                    input: {
                      relative_path: 'nonexistent',
                      recursive: false,
                    },
                    errorText:
                      "ENOENT: no such file or directory, scandir 'nonexistent'",
                  },
                ],
              }),
              createAssistantMessage(
                "I encountered an error: the directory 'nonexistent' doesn't exist in your project.\n\nPossible solutions:\n1. Check if the directory path is correct\n2. The directory might have been moved or renamed\n3. You may need to create the directory first\n\nWould you like me to list the available directories in the project root?",
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant OverwriteFile Complete
 *
 * Shows agent successfully overwriting an entire file.
 * Demonstrates: User ask → Agent think → Overwrite file (output-available) → Agent confirm
 */
export const AssistantOverwriteFileComplete: Story = {
  name: 'Assistant/Tool-OverwriteFile-Complete',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage(
                'Rewrite the constants file to use uppercase naming',
              ),
              createAssistantMessage(
                'I will rewrite the constants file with uppercase naming.',
                {
                  thinkingPart: createThinkingPart(
                    'I need to overwrite the constants file with proper naming...',
                    'done',
                  ),
                  toolParts: [
                    createOverwriteFileToolPart(
                      'src/config/constants.ts',
                      `export const API_BASE_URL = 'https://api.example.com';
export const MAX_RETRIES = 3;
export const TIMEOUT_MS = 5000;
export const DEFAULT_LOCALE = 'en-US';`,
                      'complete',
                      `export const apiBaseUrl = 'https://api.example.com';
export const maxRetries = 3;
export const timeoutMs = 5000;
export const defaultLocale = 'en-US';`,
                    ),
                  ],
                },
              ),
              createAssistantMessage(
                "I've rewritten the constants file with uppercase naming convention:\n\n- `apiBaseUrl` → `API_BASE_URL`\n- `maxRetries` → `MAX_RETRIES`\n- `timeoutMs` → `TIMEOUT_MS`\n- `defaultLocale` → `DEFAULT_LOCALE`\n\nAll constants now follow the standard SCREAMING_SNAKE_CASE convention.",
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant OverwriteFile Streaming
 *
 * Shows agent overwriting a file in streaming state.
 * Demonstrates: User ask → Agent think → Overwrite file (input-streaming)
 */
export const AssistantOverwriteFileStreaming: Story = {
  name: 'Assistant/Tool-OverwriteFile-Streaming',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage(
                'Convert the types file to use interfaces instead of types',
              ),
              createAssistantMessage('Converting to interfaces...', {
                thinkingPart: createThinkingPart(
                  'I will rewrite the file to use interface declarations...',
                  'done',
                ),
                toolParts: [
                  createOverwriteFileToolPart(
                    'src/types/user.ts',
                    `export interface User {
  id: string;
  name: string;
  email: string;
}`,
                    'streaming',
                  ),
                ],
              }),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant OverwriteFile Error
 *
 * Shows error handling when file overwrite fails.
 * Demonstrates: User ask → Agent attempt → Overwrite fails (output-error) → Agent explain
 */
export const AssistantOverwriteFileError: Story = {
  name: 'Assistant/Tool-OverwriteFile-Error',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('Rewrite the missing-file.ts'),
              createAssistantMessage('Let me rewrite that file.', {
                thinkingPart: createThinkingPart(
                  'I will overwrite the file...',
                  'done',
                ),
                toolParts: [
                  createOverwriteFileToolPart(
                    'src/missing-file.ts',
                    'export const NEW_CONTENT = true;',
                    'error',
                  ),
                ],
              }),
              createAssistantMessage(
                "I encountered an error: the file 'src/missing-file.ts' doesn't exist and cannot be overwritten.\n\nTo fix this:\n1. Check if the file path is correct\n2. If you want to create a new file, ask me to create it instead\n3. The file might have been moved or deleted\n\nWould you like me to create this file instead?",
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant OverwriteFile Create
 *
 * Shows agent creating a new file that didn't exist before.
 * Demonstrates: User ask → Agent think → Create file (output-available, diff.before === null) → Agent confirm
 */
export const AssistantOverwriteFileCreate: Story = {
  name: 'Assistant/Tool-OverwriteFile-Create',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage(
                'Create a new types file for user authentication',
              ),
              createAssistantMessage(
                'I will create a new types file for user authentication.',
                {
                  thinkingPart: createThinkingPart(
                    'Creating a new authentication types file with proper TypeScript definitions...',
                    'done',
                  ),
                  toolParts: [
                    createOverwriteFileToolPart(
                      'src/types/auth.ts',
                      `export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  expiresAt: string;
}`,
                      'complete',
                      null, // No previous content - file was created
                    ),
                  ],
                },
              ),
              createAssistantMessage(
                "I've created a new authentication types file at [src/types/auth.ts](wsfile:/src/types/auth.ts) with the following interfaces:\n\n- `User` - User profile information\n- `AuthState` - Authentication state management\n- `LoginCredentials` - Login form data\n- `AuthResponse` - API authentication response\n\nThe file is ready to be imported and used in your authentication logic.",
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant MultiEdit Complete
 *
 * Shows agent successfully making multiple edits to a file.
 * Demonstrates: User ask → Agent think → Multi-edit (output-available) → Agent confirm
 */
export const AssistantMultiEditComplete: Story = {
  name: 'Assistant/Tool-MultiEdit-Complete',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage(
                'Update the API endpoints to use the new base URL',
              ),
              createAssistantMessage(
                'I will update all API endpoints to use the new base URL.',
                {
                  thinkingPart: createThinkingPart(
                    'I need to edit multiple endpoint definitions in the API file...',
                    'done',
                  ),
                  toolParts: [
                    createMultiEditToolPart(
                      'src/api/endpoints.ts',
                      `export const USERS_ENDPOINT = 'https://new-api.example.com/users';
export const POSTS_ENDPOINT = 'https://new-api.example.com/posts';
export const AUTH_ENDPOINT = 'https://new-api.example.com/auth';`,
                      'complete',
                      `export const USERS_ENDPOINT = 'https://old-api.example.com/users';
export const POSTS_ENDPOINT = 'https://old-api.example.com/posts';
export const AUTH_ENDPOINT = 'https://old-api.example.com/auth';`,
                    ),
                  ],
                },
              ),
              createAssistantMessage(
                "I've updated all 3 API endpoints to use the new base URL:\n\n- `old-api.example.com` → `new-api.example.com`\n\nAll endpoints now point to the updated API server. Make sure to update your environment configuration as well.",
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant MultiEdit Streaming
 *
 * Shows agent making multiple edits in streaming state.
 * Demonstrates: User ask → Agent think → Multi-edit (input-streaming)
 */
export const AssistantMultiEditStreaming: Story = {
  name: 'Assistant/Tool-MultiEdit-Streaming',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage(
                'Add TypeScript types to all function parameters',
              ),
              createAssistantMessage('Adding type annotations...', {
                thinkingPart: createThinkingPart(
                  'I will add proper TypeScript types to each function parameter...',
                  'done',
                ),
                toolParts: [
                  createMultiEditToolPart(
                    'src/utils/helpers.ts',
                    `export function formatName(firstName: string, lastName: string): string {
  return \`\${firstName} \${lastName}\`;
}`,
                    'streaming',
                  ),
                ],
              }),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant MultiEdit Error
 *
 * Shows error handling when multi-edit fails.
 * Demonstrates: User ask → Agent attempt → Multi-edit fails (output-error) → Agent explain
 */
export const AssistantMultiEditError: Story = {
  name: 'Assistant/Tool-MultiEdit-Error',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('Update the imports in nonexistent.ts'),
              createAssistantMessage('Let me update those imports.', {
                thinkingPart: createThinkingPart(
                  'I will update the import statements...',
                  'done',
                ),
                toolParts: [
                  createMultiEditToolPart(
                    'src/nonexistent.ts',
                    'import { Component } from "./components";',
                    'error',
                  ),
                ],
              }),
              createAssistantMessage(
                "I encountered an error: the file 'src/nonexistent.ts' doesn't exist and cannot be edited.\n\nPossible reasons:\n1. The file path is incorrect\n2. The file was moved or deleted\n3. You may need to create the file first\n\nWould you like me to search for similar files or create a new one?",
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant Exploring Multiple
 *
 * Shows multiple exploration tools grouped together in the exploring UI.
 * Demonstrates: User ask → Agent think → Multiple exploration tools (glob, grep, read, list) → Agent summarize
 * This triggers the ExploringToolParts component that groups read-only tools together.
 */
export const AssistantExploringMultiple: Story = {
  name: 'Assistant/Tool-Exploring-Multiple',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage(
                'Analyze the authentication system in the codebase',
              ),
              createAssistantMessage(
                'Let me explore the authentication-related files in your codebase.',
                {
                  thinkingPart: createThinkingPart(
                    'I need to search for auth-related files, check their content, and understand the structure...',
                    'done',
                  ),
                  toolParts: [
                    createGlobToolPart('**/*auth*', 8, 'complete'),
                    createGrepSearchToolPart('authentication', 12, 'complete'),
                    createListFilesToolPart(
                      'src/auth',
                      [
                        {
                          relativePath: 'src/auth/login.ts',
                          name: 'login.ts',
                          type: 'file',
                          size: 2456,
                          depth: 0,
                        },
                        {
                          relativePath: 'src/auth/register.ts',
                          name: 'register.ts',
                          type: 'file',
                          size: 3102,
                          depth: 0,
                        },
                        {
                          relativePath: 'src/auth/middleware.ts',
                          name: 'middleware.ts',
                          type: 'file',
                          size: 1876,
                          depth: 0,
                        },
                      ],
                      'complete',
                    ),
                    createReadFileToolPart(
                      'src/auth/middleware.ts',
                      `export const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Verify token...
  next();
};`,
                      'complete',
                    ),
                  ],
                },
              ),
              createAssistantMessage(
                'I analyzed your authentication system by exploring 23 files. Here\'s what I found:\n\n**Structure:**\n- 8 auth-related files across the codebase\n- Main auth logic in `src/auth/` directory\n- 12 references to "authentication" in comments and docs\n\n**Key Components:**\n1. **login.ts** - Handles user login (2.4 KB)\n2. **register.ts** - User registration logic (3.1 KB)\n3. **middleware.ts** - Auth middleware with JWT verification (1.9 KB)\n\n**Security Notes:**\n- Currently using JWT tokens in Authorization header\n- Missing rate limiting on login endpoint\n- Need to add refresh token mechanism\n\nWould you like me to help implement any improvements?',
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant Unknown Tool
 *
 * Shows how an unrecognized/unknown tool type is displayed.
 * Demonstrates: User ask → Agent uses unknown tool → Fallback UI displays generic tool info
 */
export const AssistantUnknownTool: Story = {
  name: 'Assistant/Tool-Unknown',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage('Use the experimental feature'),
              createAssistantMessage('Let me try the experimental tool.', {
                thinkingPart: createThinkingPart(
                  'I will use an experimental tool...',
                  'done',
                ),
                toolParts: [
                  {
                    type: 'tool-experimentalTool' as any,
                    toolCallId: 'experimental-1',
                    state: 'output-available' as const,
                    input: {
                      target: 'codebase',
                    } as any,
                    output: {
                      message: 'Experimental analysis complete',
                      result: {
                        findings: 42,
                      },
                    },
                  },
                ],
              }),
              createAssistantMessage(
                'I used an experimental tool to analyze the codebase and found 42 potential improvements. This tool is still in development, so the results may vary.',
              ),
            ],
          },
        },
      },
    },
  },
};

/**
 * Assistant Markdown Output in TypeScript
 *
 * Shows agent outputting markdown-formatted code blocks in TypeScript.
 * Demonstrates: User ask → Agent think → Generate TypeScript code → Agent present markdown
 */
export const AssistantMarkdownTypeScript: Story = {
  name: 'Assistant/Response-Markdown-TypeScript',
  parameters: {
    mockKartonState: {
      ...baseState,
      workspace: {
        ...baseState.workspace,
      },
      agentChat: {
        ...baseState.agentChat,
        chats: {
          'chat-1': {
            ...createEmptyChat(),
            messages: [
              createUserMessage(
                'Show me an example of a custom React hook in TypeScript',
              ),
              createAssistantMessage(
                "Here's an example of a custom React hook in TypeScript:\n\n```tsx\nimport { useState, useEffect } from 'react';\n\ninterface UseDebounceOptions {\n  delay?: number;\n}\n\nexport function useDebounce<T>(value: T, options: UseDebounceOptions = {}): T {\n  const { delay = 500 } = options;\n  const [debouncedValue, setDebouncedValue] = useState<T>(value);\n\n  useEffect(() => {\n    const handler = setTimeout(() => {\n      setDebouncedValue(value);\n    }, delay);\n\n    return () => {\n      clearTimeout(handler);\n    };\n  }, [value, delay]);\n\n  return debouncedValue;\n}\n```\n\nThis hook delays updating a value, useful for search inputs or API calls.",
              ),
            ],
          },
        },
      },
    },
  },
};
