import type { Meta, StoryObj } from '@storybook/react';
import { ChatHistory } from '../../chat-history';
import { withMockKarton } from '@sb/decorators/with-mock-karton';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import {
  createUserMessage,
  createAssistantMessageWithText as createAssistantMessage,
  createReasoningPart as createThinkingPart,
  createMkdirToolPart,
  createDefaultAgentState,
} from '@sb/decorators/scenarios/shared-utilities';

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
  title: 'Agent/Messages/Mkdir Tool',
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
 * Create Directory Complete
 *
 * Full conversation showing agent creating a directory successfully.
 */
export const CreateDirectoryComplete: Story = {
  name: 'Mkdir/Complete',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Create a components directory under src'),
      createAssistantMessage(
        "I've created the `src/components` directory for you.",
        {
          thinkingPart: createThinkingPart(
            'I need to create a new directory at src/components...',
            'done',
          ),
          toolParts: [
            createMkdirToolPart('w1/src/components', 'output-available'),
          ],
        },
      ),
    ]),
  },
};

/**
 * Create Nested Directories
 *
 * Shows agent creating deeply nested directories.
 */
export const CreateNestedDirectories: Story = {
  name: 'Mkdir/Nested',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage(
        'Create the directory structure src/features/auth/components',
      ),
      createAssistantMessage(
        'Created the nested directory structure `src/features/auth/components`.',
        {
          thinkingPart: createThinkingPart(
            'Creating nested directories with mkdir -p behavior...',
            'done',
          ),
          toolParts: [
            createMkdirToolPart(
              'w1/src/features/auth/components',
              'output-available',
            ),
          ],
        },
      ),
    ]),
  },
};

/**
 * Create Directory Streaming
 *
 * Shows the mkdir tool in streaming state.
 */
export const CreateDirectoryStreaming: Story = {
  name: 'Mkdir/Streaming',
  parameters: {
    mockKartonState: createStoryState(
      [
        createUserMessage('Create a utils directory'),
        createAssistantMessage('Creating the directory...', {
          thinkingPart: createThinkingPart(
            'I need to create a utils directory...',
            'done',
          ),
          toolParts: [createMkdirToolPart('w1/src/utils', 'input-streaming')],
        }),
      ],
      { isWorking: true },
    ),
  },
};

/**
 * Create Directory Error — File Exists
 *
 * Shows the error state when a file already exists at the target path.
 */
export const CreateDirectoryErrorFileExists: Story = {
  name: 'Mkdir/Error-FileExists',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Create a directory at src/index.ts'),
      createAssistantMessage(
        'I was unable to create the directory because a file already exists at that path.',
        {
          thinkingPart: createThinkingPart(
            'Trying to create directory at src/index.ts...',
            'done',
          ),
          toolParts: [
            createMkdirToolPart('w1/src/index.ts', 'output-error', {
              errorText:
                'A file already exists at w1/src/index.ts. Cannot create directory.',
            }),
          ],
        },
      ),
    ]),
  },
};

/**
 * Multiple Directories
 *
 * Shows agent creating multiple directories in sequence.
 */
export const MultipleDirectories: Story = {
  name: 'Mkdir/Multiple',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage(
        'Set up the project structure with components, hooks, and utils directories',
      ),
      createAssistantMessage(
        "I've created all three directories under `src/`.",
        {
          thinkingPart: createThinkingPart(
            'I need to create multiple directories for the project structure...',
            'done',
          ),
          toolParts: [
            createMkdirToolPart('w1/src/components', 'output-available'),
            createMkdirToolPart('w1/src/hooks', 'output-available'),
            createMkdirToolPart('w1/src/utils', 'output-available'),
          ],
        },
      ),
    ]),
  },
};
