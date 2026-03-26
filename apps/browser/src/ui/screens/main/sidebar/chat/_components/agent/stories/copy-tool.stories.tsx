import type { Meta, StoryObj } from '@storybook/react';
import { ChatHistory } from '../../chat-history';
import { withMockKarton } from '@sb/decorators/with-mock-karton';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import {
  createUserMessage,
  createAssistantMessageWithText as createAssistantMessage,
  createReasoningPart as createThinkingPart,
  createCopyToolPart,
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
  title: 'Agent/Messages/Copy Tool',
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

/**
 * Copy File Complete
 *
 * Full conversation showing agent copying a file successfully.
 * Demonstrates: User ask → Agent think → Copy file tool (output-available) → Agent confirm
 */
export const CopyFileComplete: Story = {
  name: 'Copy/File-Complete',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Copy utils.ts to the lib directory'),
      createAssistantMessage("I've copied the file to the lib directory.", {
        thinkingPart: createThinkingPart(
          'I need to copy src/utils.ts to src/lib/utils.ts...',
          'done',
        ),
        toolParts: [
          createCopyToolPart(
            'w1/src/utils.ts',
            'w1/src/lib/utils.ts',
            false,
            'output-available',
          ),
        ],
      }),
      createAssistantMessage(
        'The file has been copied from `src/utils.ts` to `src/lib/utils.ts`. The original file remains in place.',
      ),
    ]),
  },
};

/**
 * Copy File Streaming
 *
 * Shows agent copying a file in streaming state.
 * Demonstrates: User ask → Agent think → Copy file (input-streaming)
 */
export const CopyFileStreaming: Story = {
  name: 'Copy/File-Streaming',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Copy the config file to the backup directory'),
      createAssistantMessage('Copying the config file...', {
        thinkingPart: createThinkingPart(
          'I will copy the config file to the backup directory...',
          'done',
        ),
        toolParts: [
          createCopyToolPart(
            'w1/src/config.ts',
            'w1/backup/config.ts',
            false,
            'input-streaming',
          ),
        ],
      }),
    ]),
  },
};

/**
 * Copy File Error
 *
 * Shows error handling when copy fails because source doesn't exist.
 * Demonstrates: User ask → Agent attempt → Copy fails (output-error) → Agent explain
 */
export const CopyFileError: Story = {
  name: 'Copy/File-Error',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Copy the missing-file.ts to the lib directory'),
      createAssistantMessage('Let me copy that file for you.', {
        thinkingPart: createThinkingPart(
          'I will copy the file to the lib directory...',
          'done',
        ),
        toolParts: [
          {
            type: 'tool-copy' as const,
            toolCallId: 'copy-error-1',
            state: 'output-error' as const,
            input: {
              input_path: 'w1/src/missing-file.ts',
              output_path: 'w1/src/lib/missing-file.ts',
              move: false,
            },
            errorText: 'Source not found: w1/src/missing-file.ts',
          },
        ],
      }),
      createAssistantMessage(
        "I encountered an error: the source file 'src/missing-file.ts' doesn't exist.\n\nWould you like me to search for files with a similar name?",
      ),
    ]),
  },
};

/**
 * Copy Directory Complete
 *
 * Shows agent copying an entire directory.
 * Demonstrates: User ask → Agent think → Copy directory (output-available) → Agent confirm
 */
export const CopyDirectoryComplete: Story = {
  name: 'Copy/Directory-Complete',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Copy the components directory to a backup'),
      createAssistantMessage("I've copied the entire components directory.", {
        thinkingPart: createThinkingPart(
          'I need to recursively copy the components directory...',
          'done',
        ),
        toolParts: [
          createCopyToolPart(
            'w1/src/components',
            'w1/backup/components',
            false,
            'output-available',
          ),
        ],
      }),
      createAssistantMessage(
        'The `src/components` directory has been copied to `backup/components`. All files and subdirectories were included.',
      ),
    ]),
  },
};

/**
 * Move File Complete
 *
 * Full conversation showing agent moving a file successfully.
 * Demonstrates: User ask → Agent think → Move file tool (output-available) → Agent confirm
 */
export const MoveFileComplete: Story = {
  name: 'Move/File-Complete',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Move helpers.ts to the utils directory'),
      createAssistantMessage("I've moved the file to the utils directory.", {
        thinkingPart: createThinkingPart(
          'I need to move src/helpers.ts to src/utils/helpers.ts...',
          'done',
        ),
        toolParts: [
          createCopyToolPart(
            'w1/src/helpers.ts',
            'w1/src/utils/helpers.ts',
            true,
            'output-available',
          ),
        ],
      }),
      createAssistantMessage(
        'The file has been moved from `src/helpers.ts` to `src/utils/helpers.ts`. The original file has been removed.\n\n**Note:** You may need to update import paths that reference the old location.',
      ),
    ]),
  },
};

/**
 * Move File Streaming
 *
 * Shows agent moving a file in streaming state.
 * Demonstrates: User ask → Agent think → Move file (input-streaming)
 */
export const MoveFileStreaming: Story = {
  name: 'Move/File-Streaming',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Move the old test file to the archive'),
      createAssistantMessage('Moving the file...', {
        thinkingPart: createThinkingPart(
          'I will move the test file to the archive directory...',
          'done',
        ),
        toolParts: [
          createCopyToolPart(
            'w1/src/tests/old-test.spec.ts',
            'w1/archive/old-test.spec.ts',
            true,
            'input-streaming',
          ),
        ],
      }),
    ]),
  },
};

/**
 * Move File Error
 *
 * Shows error handling when move fails (e.g., trying to move a directory into a file).
 * Demonstrates: User ask → Agent attempt → Move fails (output-error) → Agent explain
 */
export const MoveFileError: Story = {
  name: 'Move/File-Error',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Move the src directory into package.json'),
      createAssistantMessage('Let me move that for you.', {
        thinkingPart: createThinkingPart(
          'I will move the directory...',
          'done',
        ),
        toolParts: [
          {
            type: 'tool-copy' as const,
            toolCallId: 'move-error-1',
            state: 'output-error' as const,
            input: {
              input_path: 'w1/src',
              output_path: 'w1/package.json',
              move: true,
            },
            errorText:
              'Cannot copy directory into existing file: w1/package.json',
          },
        ],
      }),
      createAssistantMessage(
        "I encountered an error: you can't move a directory into an existing file. The destination `package.json` is a file, not a directory.\n\nWould you like me to move it to a different location instead?",
      ),
    ]),
  },
};

/**
 * Move Directory Complete
 *
 * Shows agent moving an entire directory (rename/relocate).
 * Demonstrates: User ask → Agent think → Move directory (output-available) → Agent confirm
 */
export const MoveDirectoryComplete: Story = {
  name: 'Move/Directory-Complete',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Rename the utils directory to lib'),
      createAssistantMessage("I've renamed the directory by moving it.", {
        thinkingPart: createThinkingPart(
          'I can rename a directory by moving it to the new name...',
          'done',
        ),
        toolParts: [
          createCopyToolPart(
            'w1/src/utils',
            'w1/src/lib',
            true,
            'output-available',
          ),
        ],
      }),
      createAssistantMessage(
        'The `src/utils` directory has been renamed to `src/lib`. All files inside were moved.\n\n**Remember** to update any import paths that referenced `utils/` to use `lib/` instead.',
      ),
    ]),
  },
};

/**
 * Copy Directory Streaming
 *
 * Shows agent copying a directory in streaming state.
 * Demonstrates: User ask → Agent think → Copy directory (input-streaming)
 */
export const CopyDirectoryStreaming: Story = {
  name: 'Copy/Directory-Streaming',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Copy the hooks directory to a shared location'),
      createAssistantMessage('Copying the hooks directory...', {
        thinkingPart: createThinkingPart(
          'I will copy the hooks directory to the shared location...',
          'done',
        ),
        toolParts: [
          createCopyToolPart(
            'w1/src/hooks',
            'w1/shared/hooks',
            false,
            'input-streaming',
          ),
        ],
      }),
    ]),
  },
};

/**
 * Copy Directory Error
 *
 * Shows error handling when copying a directory fails.
 * Demonstrates: User ask → Agent attempt → Copy fails (output-error) → Agent explain
 */
export const CopyDirectoryError: Story = {
  name: 'Copy/Directory-Error',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Copy the src directory into dist/output.js'),
      createAssistantMessage('Let me copy that directory for you.', {
        thinkingPart: createThinkingPart(
          'I will copy the src directory...',
          'done',
        ),
        toolParts: [
          {
            type: 'tool-copy' as const,
            toolCallId: 'copy-dir-error-1',
            state: 'output-error' as const,
            input: {
              input_path: 'w1/src',
              output_path: 'w1/dist/output.js',
              move: false,
            },
            errorText:
              'Cannot copy directory into existing file: w1/dist/output.js',
          },
        ],
      }),
      createAssistantMessage(
        "I encountered an error: you can't copy a directory into an existing file. The destination `dist/output.js` is a file, not a directory.\n\nWould you like me to copy it to `dist/src/` instead?",
      ),
    ]),
  },
};

/**
 * Move Directory Streaming
 *
 * Shows agent moving a directory in streaming state.
 * Demonstrates: User ask → Agent think → Move directory (input-streaming)
 */
export const MoveDirectoryStreaming: Story = {
  name: 'Move/Directory-Streaming',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Move the legacy directory into archive'),
      createAssistantMessage('Moving the legacy directory...', {
        thinkingPart: createThinkingPart(
          'I will move the legacy directory to the archive location...',
          'done',
        ),
        toolParts: [
          createCopyToolPart(
            'w1/src/legacy',
            'w1/archive/legacy',
            true,
            'input-streaming',
          ),
        ],
      }),
    ]),
  },
};

/**
 * Move Directory Error
 *
 * Shows error handling when moving a directory fails because destination exists.
 * Demonstrates: User ask → Agent attempt → Move fails (output-error) → Agent explain
 */
export const MoveDirectoryError: Story = {
  name: 'Move/Directory-Error',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Move the components directory to lib'),
      createAssistantMessage('Let me move the components directory.', {
        thinkingPart: createThinkingPart(
          'I will move components to lib...',
          'done',
        ),
        toolParts: [
          {
            type: 'tool-copy' as const,
            toolCallId: 'move-dir-error-1',
            state: 'output-error' as const,
            input: {
              input_path: 'w1/src/components',
              output_path: 'w1/src/lib',
              move: true,
            },
            errorText: 'Destination directory already exists: w1/src/lib',
          },
        ],
      }),
      createAssistantMessage(
        'I encountered an error: the destination directory `src/lib` already exists. Moving `src/components` into it would overwrite existing files.\n\nOptions:\n1. Move to a different name like `src/lib-components`\n2. Merge the contents manually\n3. Delete `src/lib` first and then retry\n\nWhich approach would you prefer?',
      ),
    ]),
  },
};

// ============================================================================
// Rename Stories (Move where only the final name differs)
// ============================================================================

/**
 * Rename File Complete
 *
 * Move where source and destination share the same parent directory.
 * The UI should show "Renamed" instead of "Moved".
 */
export const RenameFileComplete: Story = {
  name: 'Rename/File-Complete',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Rename utils.ts to helpers.ts'),
      createAssistantMessage("I've renamed the file.", {
        thinkingPart: createThinkingPart(
          'I need to rename utils.ts to helpers.ts in the same directory...',
          'done',
        ),
        toolParts: [
          createCopyToolPart(
            'w1/src/utils.ts',
            'w1/src/helpers.ts',
            true,
            'output-available',
          ),
        ],
      }),
      createAssistantMessage(
        'The file has been renamed from `src/utils.ts` to `src/helpers.ts`. Remember to update any imports.',
      ),
    ]),
  },
};

/**
 * Rename File Streaming
 *
 * Shows the "Renaming" label during streaming state.
 */
export const RenameFileStreaming: Story = {
  name: 'Rename/File-Streaming',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Rename config.json to settings.json'),
      createAssistantMessage('Renaming the config file...', {
        thinkingPart: createThinkingPart(
          'I will rename config.json to settings.json...',
          'done',
        ),
        toolParts: [
          createCopyToolPart(
            'w1/src/config.json',
            'w1/src/settings.json',
            true,
            'input-streaming',
          ),
        ],
      }),
    ]),
  },
};

/**
 * Rename Directory Complete
 *
 * Renaming a directory (same parent, different name).
 */
export const RenameDirectoryComplete: Story = {
  name: 'Rename/Directory-Complete',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Rename the utils directory to lib'),
      createAssistantMessage("I've renamed the directory.", {
        thinkingPart: createThinkingPart(
          'I can rename the directory by moving it to the new name...',
          'done',
        ),
        toolParts: [
          createCopyToolPart(
            'w1/src/utils',
            'w1/src/lib',
            true,
            'output-available',
          ),
        ],
      }),
      createAssistantMessage(
        'The `src/utils` directory has been renamed to `src/lib`. Update any import paths accordingly.',
      ),
    ]),
  },
};

/**
 * Rename vs Move Comparison
 *
 * Side-by-side comparison: rename (same parent) shows "Renamed",
 * move (different parent) shows "Moved", copy shows "Copied".
 */
export const RenameVsMoveComparison: Story = {
  name: 'Comparison/Rename-vs-Move-vs-Copy',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage(
        'Rename Button.tsx to BaseButton.tsx, move Card.tsx to shared/, and copy Modal.tsx to backup/',
      ),
      createAssistantMessage('All operations completed.', {
        thinkingPart: createThinkingPart(
          'Three operations: rename, move, and copy...',
          'done',
        ),
        toolParts: [
          // Rename: same parent directory
          createCopyToolPart(
            'w1/src/components/Button.tsx',
            'w1/src/components/BaseButton.tsx',
            true,
            'output-available',
          ),
          // Move: different parent directory
          createCopyToolPart(
            'w1/src/components/Card.tsx',
            'w1/src/shared/Card.tsx',
            true,
            'output-available',
          ),
          // Copy: not a move at all
          createCopyToolPart(
            'w1/src/components/Modal.tsx',
            'w1/backup/components/Modal.tsx',
            false,
            'output-available',
          ),
        ],
      }),
      createAssistantMessage(
        'Done:\n\n- **Renamed** `Button.tsx` → `BaseButton.tsx` (same folder)\n- **Moved** `Card.tsx` → `shared/Card.tsx` (different folder)\n- **Copied** `Modal.tsx` → `backup/components/Modal.tsx`',
      ),
    ]),
  },
};

/**
 * Copy and Move Combined
 *
 * Agent performs both copy and move operations in the same message.
 * Demonstrates: User ask → Agent think → Copy + Move in sequence → Agent confirm
 */
export const CopyAndMoveCombined: Story = {
  name: 'Combined/Copy-And-Move',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage(
        'Copy the shared types to both packages, then move the original to a new location',
      ),
      createAssistantMessage("I've copied the types and moved the original.", {
        thinkingPart: createThinkingPart(
          'I need to copy the types file to two packages and then move the original...',
          'done',
        ),
        toolParts: [
          createCopyToolPart(
            'w1/src/types/shared.ts',
            'w1/packages/core/types/shared.ts',
            false,
            'output-available',
          ),
          createCopyToolPart(
            'w1/src/types/shared.ts',
            'w1/packages/ui/types/shared.ts',
            false,
            'output-available',
          ),
          createCopyToolPart(
            'w1/src/types/shared.ts',
            'w1/packages/shared/types/index.ts',
            true,
            'output-available',
          ),
        ],
      }),
      createAssistantMessage(
        "Done! Here's what happened:\n\n1. **Copied** `src/types/shared.ts` → `packages/core/types/shared.ts`\n2. **Copied** `src/types/shared.ts` → `packages/ui/types/shared.ts`\n3. **Moved** `src/types/shared.ts` → `packages/shared/types/index.ts`\n\nThe original file has been moved to its new canonical location. Both packages now have their own copy.",
      ),
    ]),
  },
};
