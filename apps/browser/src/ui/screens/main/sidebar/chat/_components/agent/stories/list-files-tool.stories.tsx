import type { Meta, StoryObj } from '@storybook/react';
import { ChatHistory } from '../../chat-history';
import { withMockKarton } from '@sb/decorators/with-mock-karton';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import {
  createUserMessage,
  createAssistantMessageWithText as createAssistantMessage,
  createReasoningPart as createThinkingPart,
  createLsToolPart,
  createReadToolPart,
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
  title: 'Agent/Messages/ListFiles Tool',
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
 * List Directory Complete
 *
 * Full conversation showing agent listing a directory successfully.
 */
export const ListDirectoryComplete: Story = {
  name: 'ListFiles/Complete',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage("What's in the src directory?"),
      createAssistantMessage('Here are the contents of the `src/` directory.', {
        thinkingPart: createThinkingPart(
          'I need to list the contents of the src directory...',
          'done',
        ),
        toolParts: [createLsToolPart('w1/src', 'output-available')],
      }),
    ]),
  },
};

/**
 * List Directory Streaming
 *
 * Shows the listFiles tool in streaming state.
 */
export const ListDirectoryStreaming: Story = {
  name: 'ListFiles/Streaming',
  parameters: {
    mockKartonState: createStoryState(
      [
        createUserMessage('Show me the project structure'),
        createAssistantMessage('Listing the project structure...', {
          thinkingPart: createThinkingPart(
            'I need to list the project root directory...',
            'done',
          ),
          toolParts: [createLsToolPart('w1/src', 'input-streaming')],
        }),
      ],
      { isWorking: true },
    ),
  },
};

/**
 * List Then Read
 *
 * Shows listing a directory then reading a file from it — the typical
 * explore-then-read workflow.
 */
export const ListThenRead: Story = {
  name: 'ListFiles/ListThenRead',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Look at the components directory'),
      createAssistantMessage(
        'I found several components. Let me look at the Button component.',
        {
          thinkingPart: createThinkingPart(
            'First list the directory, then read an interesting file...',
            'done',
          ),
          toolParts: [
            createLsToolPart('w1/src/components', 'output-available'),
            createReadToolPart(
              'w1/src/components/Button.tsx',
              'output-available',
            ),
          ],
        },
      ),
    ]),
  },
};

/**
 * Multiple Directories
 *
 * Shows agent listing several directories in sequence.
 */
export const MultipleDirectories: Story = {
  name: 'ListFiles/Multiple',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Show me the overall project structure'),
      createAssistantMessage("Here's an overview of the main directories.", {
        thinkingPart: createThinkingPart(
          'I need to list several top-level directories...',
          'done',
        ),
        toolParts: [
          createLsToolPart('w1/src', 'output-available'),
          createLsToolPart('w1/tests', 'output-available'),
          createLsToolPart('w1/public', 'output-available'),
        ],
      }),
    ]),
  },
};
