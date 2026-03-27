import type { Meta, StoryObj } from '@storybook/react';
import { ChatHistory } from '../../chat-history';
import { withMockKarton } from '@sb/decorators/with-mock-karton';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import {
  createUserMessage,
  createAssistantMessageWithText as createAssistantMessage,
  createReasoningPart as createThinkingPart,
  createDeleteFileToolPart,
  createDefaultAgentState,
} from '@sb/decorators/scenarios/shared-utilities';

// Helper to create story state with messages
const createStoryState = (
  messages: AgentMessage[],
  options?: { isWorking?: boolean },
) =>
  createDefaultAgentState(
    {
      initialHistory: messages,
      isWorking: options?.isWorking,
    },
    {
      userExperience: {
        storedExperienceData: {
          recentlyOpenedWorkspaces: [],
          hasSeenOnboardingFlow: false,
          lastViewedChats: {},
        },
        pendingOnboardingSuggestion: null,
        devAppPreview: {
          isFullScreen: false,
          inShowCodeMode: false,
          customScreenSize: null,
        },
      },
    },
  );

const meta: Meta<typeof ChatHistory> = {
  title: 'Agent/Messages/Delete Tool',
  component: ChatHistory,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', minHeight: '400px' }}>
        <Story />
      </div>
    ),
    withMockKarton,
  ],
};

export default meta;
type Story = StoryObj<typeof ChatHistory>;

// ============================================================================
// File Deletion Stories
// ============================================================================

/**
 * Delete File Complete
 *
 * Full conversation showing agent deleting a single file successfully.
 * Demonstrates: User ask → Agent think → Delete file tool (output-available) → Agent confirm
 */
export const DeleteFileComplete: Story = {
  name: 'Delete/File-Complete',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Delete the old Button.test.tsx file'),
      createAssistantMessage("I've successfully deleted the old test file.", {
        thinkingPart: createThinkingPart(
          'I need to delete the Button.test.tsx file...',
          'done',
        ),
        toolParts: [
          createDeleteFileToolPart(
            'w1/src/components/Button.test.tsx',
            'output-available',
            {
              deletedContent: `import { render, screen } from '@testing-library/react';
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
});`,
            },
          ),
        ],
      }),
      createAssistantMessage(
        'The file `src/components/Button.test.tsx` has been deleted. The old test file has been removed from your project.',
      ),
    ]),
  },
};

/**
 * Delete File Streaming
 *
 * Shows agent deleting a file in streaming state.
 * Demonstrates: User ask → Agent think → Delete file (input-streaming)
 */
export const DeleteFileStreaming: Story = {
  name: 'Delete/File-Streaming',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Remove the deprecated utils.ts file'),
      createAssistantMessage('Deleting the deprecated file...', {
        thinkingPart: createThinkingPart(
          'The utils.ts file is deprecated and should be removed...',
          'done',
        ),
        toolParts: [
          createDeleteFileToolPart('w1/src/utils/utils.ts', 'input-streaming'),
        ],
      }),
    ]),
  },
};

/**
 * Delete File Error
 *
 * Shows error handling when file deletion fails because the file doesn't exist.
 * Demonstrates: User ask → Agent attempt → Delete fails (output-error) → Agent explain
 */
export const DeleteFileError: Story = {
  name: 'Delete/File-Error',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Delete the Config.tsx file'),
      createAssistantMessage('Let me delete that file for you.', {
        thinkingPart: createThinkingPart(
          'I will delete the Config.tsx file...',
          'done',
        ),
        toolParts: [
          {
            type: 'tool-delete' as const,
            toolCallId: 'delete-err-1',
            state: 'output-error' as const,
            input: {
              path: 'w1/src/components/Config.tsx',
            },
            errorText:
              "ENOENT: no such file or directory, unlink 'w1/src/components/Config.tsx'",
          },
        ],
      }),
      createAssistantMessage(
        "I encountered an error: the file `src/components/Config.tsx` doesn't exist and cannot be deleted.\n\nPossible reasons:\n1. The file has already been deleted\n2. The file path is incorrect\n3. The file might have been moved to a different location\n\nWould you like me to search for files with similar names?",
      ),
    ]),
  },
};

// ============================================================================
// Directory Deletion Stories
// ============================================================================

/**
 * Delete Empty Directory Complete
 *
 * Agent deletes an empty directory.
 * Demonstrates: User ask → Agent think → Delete directory (output-available) → Agent confirm
 */
export const DeleteEmptyDirectoryComplete: Story = {
  name: 'Delete/Empty-Directory-Complete',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Delete the empty temp directory'),
      createAssistantMessage("I've deleted the empty temp directory.", {
        thinkingPart: createThinkingPart(
          'The user wants to remove the temp directory. I will delete it...',
          'done',
        ),
        toolParts: [
          {
            type: 'tool-delete' as const,
            toolCallId: 'delete-dir-1',
            state: 'output-available' as const,
            input: {
              path: 'w1/src/temp',
            },
            output: {
              message: 'Directory deleted successfully',
              _diff: {
                before: null,
                after: null,
              },
              nonSerializableMetadata: {
                undoExecute: null as any,
              },
            },
          },
        ],
      }),
      createAssistantMessage(
        'The `src/temp` directory has been removed from your project.',
      ),
    ]),
  },
};

/**
 * Delete Directory With Contents Complete
 *
 * Agent deletes a directory containing multiple files and subdirectories.
 * Demonstrates: User ask → Agent think → Delete directory with contents (output-available) → Agent confirm
 */
export const DeleteDirectoryWithContentsComplete: Story = {
  name: 'Delete/Directory-With-Contents-Complete',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage(
        'Delete the old-components directory and everything inside it',
      ),
      createAssistantMessage(
        "I've deleted the old-components directory and all its contents.",
        {
          thinkingPart: createThinkingPart(
            'The user wants to recursively delete the old-components directory. This will remove all files and subdirectories within it...',
            'done',
          ),
          toolParts: [
            {
              type: 'tool-delete' as const,
              toolCallId: 'delete-dir-contents-1',
              state: 'output-available' as const,
              input: {
                path: 'w1/src/old-components',
              },
              output: {
                message: 'Directory deleted successfully',
                _diff: {
                  before: null,
                  after: null,
                },
                nonSerializableMetadata: {
                  undoExecute: null as any,
                },
              },
            },
          ],
        },
      ),
      createAssistantMessage(
        'The `src/old-components` directory has been deleted along with all its contents.\n\n**Deleted structure:**\n- `old-components/Button.tsx`\n- `old-components/Card.tsx`\n- `old-components/Modal.tsx`\n- `old-components/styles/`\n\nMake sure to remove any imports referencing these old components.',
      ),
    ]),
  },
};

/**
 * Delete Directory Streaming
 *
 * Shows agent deleting a directory in streaming state.
 * Demonstrates: User ask → Agent think → Delete directory (input-streaming)
 */
export const DeleteDirectoryStreaming: Story = {
  name: 'Delete/Directory-Streaming',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Remove the deprecated-hooks directory'),
      createAssistantMessage('Deleting the deprecated hooks directory...', {
        thinkingPart: createThinkingPart(
          'I will remove the deprecated-hooks directory and all its contents...',
          'done',
        ),
        toolParts: [
          {
            type: 'tool-delete' as const,
            toolCallId: 'delete-dir-stream-1',
            state: 'input-streaming' as const,
            input: {
              path: 'w1/src/hooks/deprecated-hooks',
            },
          },
        ],
      }),
    ]),
  },
};

/**
 * Delete Directory Error - Not Empty
 *
 * Shows error handling when directory deletion fails because it's not empty
 * and recursive deletion is not supported or fails.
 * Demonstrates: User ask → Agent attempt → Delete fails (output-error) → Agent explain
 */
export const DeleteDirectoryError: Story = {
  name: 'Delete/Directory-Error',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Delete the node_modules directory'),
      createAssistantMessage('Let me delete the node_modules directory.', {
        thinkingPart: createThinkingPart(
          'I will try to delete the node_modules directory...',
          'done',
        ),
        toolParts: [
          {
            type: 'tool-delete' as const,
            toolCallId: 'delete-dir-err-1',
            state: 'output-error' as const,
            input: {
              path: 'w1/node_modules',
            },
            errorText:
              'Cannot delete path outside of workspace mount: w1/node_modules',
          },
        ],
      }),
      createAssistantMessage(
        'I encountered an error trying to delete `node_modules`. This path is restricted.\n\nYou can remove it manually by running:\n```bash\nrm -rf node_modules\n```\n\nOr use `pnpm clean` which is configured in your project scripts.',
      ),
    ]),
  },
};

/**
 * Delete Directory Error - Permission Denied
 *
 * Shows error handling when directory deletion fails due to permissions.
 * Demonstrates: User ask → Agent attempt → Delete fails (output-error) → Agent explain
 */
export const DeleteDirectoryPermissionError: Story = {
  name: 'Delete/Directory-Permission-Error',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Delete the config directory'),
      createAssistantMessage('Let me delete the config directory for you.', {
        thinkingPart: createThinkingPart(
          'I will delete the config directory...',
          'done',
        ),
        toolParts: [
          {
            type: 'tool-delete' as const,
            toolCallId: 'delete-dir-perm-1',
            state: 'output-error' as const,
            input: {
              path: 'w1/config',
            },
            errorText: "EACCES: permission denied, rmdir 'w1/config'",
          },
        ],
      }),
      createAssistantMessage(
        "I encountered a permission error when trying to delete the `config` directory. The directory appears to be read-only or protected.\n\nYou'll need to check your filesystem permissions or delete it manually with elevated privileges.",
      ),
    ]),
  },
};

/**
 * Delete File vs Directory Comparison
 *
 * Side-by-side comparison of file delete (collapsible with diff) vs directory
 * delete (simple flat row with folder icon). Shows how the two types look different.
 */
export const FileVsDirectoryComparison: Story = {
  name: 'Delete/File-vs-Directory-Comparison',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage(
        'Delete the helpers.ts file and the old-tests directory',
      ),
      createAssistantMessage(
        "I've deleted the file and directory as requested.",
        {
          thinkingPart: createThinkingPart(
            'Deleting the file and directory...',
            'done',
          ),
          toolParts: [
            createDeleteFileToolPart('w1/src/helpers.ts', 'output-available', {
              deletedContent: `export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + '...' : s;
}`,
            }),
            {
              type: 'tool-delete' as const,
              toolCallId: 'delete-comparison-dir-1',
              state: 'output-available' as const,
              input: {
                path: 'w1/src/old-tests',
              },
              output: {
                message: 'Directory deleted successfully',
                _diff: {
                  before: null,
                  after: null,
                },
                nonSerializableMetadata: {
                  undoExecute: null as any,
                },
              },
            },
          ],
        },
      ),
      createAssistantMessage(
        'Done! Deleted `src/helpers.ts` (file with diff preview) and `src/old-tests/` (directory shown as flat row).',
      ),
    ]),
  },
};

/**
 * Delete Multiple Files and Directory
 *
 * Agent deletes multiple items in sequence — files and a directory.
 * Demonstrates: User ask → Agent think → Multiple delete tools → Agent confirm
 */
export const DeleteMultipleItems: Story = {
  name: 'Delete/Multiple-Items',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage(
        'Clean up the project: delete old-utils.ts, legacy-config.json, and the deprecated/ directory',
      ),
      createAssistantMessage(
        "I've cleaned up all the requested files and directories.",
        {
          thinkingPart: createThinkingPart(
            'The user wants to clean up multiple items. I will delete them one by one...',
            'done',
          ),
          toolParts: [
            createDeleteFileToolPart(
              'w1/src/old-utils.ts',
              'output-available',
              {
                deletedContent: `/**
 * @deprecated Use @/lib/utils instead
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/\\s+/g, '-');
}`,
              },
            ),
            createDeleteFileToolPart(
              'w1/legacy-config.json',
              'output-available',
              {
                deletedContent: `{
  "apiVersion": "v1",
  "deprecated": true,
  "endpoints": {
    "auth": "https://old-api.example.com/auth",
    "data": "https://old-api.example.com/data"
  }
}`,
              },
            ),
            {
              type: 'tool-delete' as const,
              toolCallId: 'delete-multi-dir-1',
              state: 'output-available' as const,
              input: {
                path: 'w1/src/deprecated',
              },
              output: {
                message: 'Directory deleted successfully',
                _diff: {
                  before: null,
                  after: null,
                },
                nonSerializableMetadata: {
                  undoExecute: null as any,
                },
              },
            },
          ],
        },
      ),
      createAssistantMessage(
        'All cleanup complete:\n\n- ✅ Deleted `src/old-utils.ts`\n- ✅ Deleted `legacy-config.json`\n- ✅ Deleted `src/deprecated/` directory\n\nMake sure to update any imports that referenced these files.',
      ),
    ]),
  },
};
