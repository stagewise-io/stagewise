import type { Meta, StoryObj } from '@storybook/react';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import {
  WorkspaceMdStatusSection,
  type WorkspaceMdStatus,
} from '../workspace-md-section';
import { StatusCardSectionComponent } from '../shared';

// Helper to create mock assistant messages with tool parts
function createMockToolMessage(
  toolType: string,
  input?: Record<string, unknown>,
): AgentMessage {
  return {
    id: `mock-message-${Date.now()}`,
    role: 'assistant',
    parts: [
      {
        type: toolType,
        state: 'input-available',
        input: input ?? {},
      } as AgentMessage['parts'][number],
    ],
  };
}

// Wrapper component to render the section
interface WorkspaceMdSectionStoryProps {
  status: WorkspaceMdStatus;
  history: AgentMessage[];
  errorMessage?: string | null;
}

function WorkspaceMdSectionStory({
  status,
  history,
  errorMessage,
}: WorkspaceMdSectionStoryProps) {
  const section = WorkspaceMdStatusSection({
    status,
    sectionKey: 'storybook-workspace-md',
    workspaceName: 'my-project',
    history,
    errorMessage,
    onDismiss: () => console.log('[Storybook] onDismiss called'),
    onShowFile: () =>
      console.log(
        '[Storybook] onShowFile called - would navigate to agent-settings#context-files',
      ),
  });

  if (!section) {
    return (
      <div className="rounded border border-muted-foreground border-dashed p-4 text-center text-muted-foreground text-sm">
        Section is hidden (status = &apos;hidden&apos;)
      </div>
    );
  }

  return (
    <div className="relative rounded-lg border border-border bg-background p-1">
      <StatusCardSectionComponent item={section} showDivider={false} />
    </div>
  );
}

const meta: Meta<typeof WorkspaceMdSectionStory> = {
  title: 'Chat/Footer Status Card/Project MD Section',
  component: WorkspaceMdSectionStory,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[400px] p-4">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    status: {
      control: 'select',
      options: ['hidden', 'running', 'completed', 'error'],
      description: 'Current status of the project-md generation',
    },
  },
};

export default meta;
type Story = StoryObj<typeof WorkspaceMdSectionStory>;

/**
 * Hidden State
 *
 * When status is 'hidden', the section returns null and nothing is rendered.
 * This is the default state when no project-md generation is in progress.
 */
export const Hidden: Story = {
  args: {
    status: 'hidden',
    history: [],
  },
};

/**
 * Running - Initial State
 *
 * When generation first starts with no tool calls yet.
 * Shows "Initializing ..."
 */
export const RunningInitial: Story = {
  name: 'Running / Initial',
  args: {
    status: 'running',
    history: [],
  },
};

/**
 * Running - Reading Files
 *
 * When the agent is reading a specific file.
 * Shows "Reading Button.tsx..."
 */
export const RunningReadingFiles: Story = {
  name: 'Running / Reading Files',
  args: {
    status: 'running',
    history: [
      createMockToolMessage('tool-readFile', {
        relative_path: 'src/components/Button.tsx',
      }),
    ],
  },
};

/**
 * Running - Listing Files
 *
 * When the agent is listing files in a directory.
 * Shows "Listing files in src/components..."
 */
export const RunningListingFiles: Story = {
  name: 'Running / Listing Files',
  args: {
    status: 'running',
    history: [
      createMockToolMessage('tool-listFiles', {
        relative_path: 'src/components',
      }),
    ],
  },
};

/**
 * Running - Glob Search
 *
 * When the agent is searching for files using glob patterns.
 * Shows "Searching for **\/*.tsx..."
 */
export const RunningGlobSearch: Story = {
  name: 'Running / Glob Search',
  args: {
    status: 'running',
    history: [
      createMockToolMessage('tool-glob', {
        pattern: '**/*.tsx',
      }),
    ],
  },
};

/**
 * Running - Grep Search
 *
 * When the agent is searching code for specific patterns.
 * Shows "Searching code for useState..."
 */
export const RunningGrepSearch: Story = {
  name: 'Running / Grep Search',
  args: {
    status: 'running',
    history: [
      createMockToolMessage('tool-grepSearch', {
        query: 'useState',
      }),
    ],
  },
};

/**
 * Running - Writing
 *
 * When the agent is writing the final .stagewise/WORKSPACE.md file.
 * Shows "Writing ..."
 */
export const RunningWritingFile: Story = {
  name: 'Running / Writing ',
  args: {
    status: 'running',
    history: [createMockToolMessage('tool-overwriteFile', {})],
  },
};

/**
 * Running - Multiple Tool Calls
 *
 * Demonstrates that the section shows the LAST tool call status.
 * After reading files and listing, now searching with grep.
 */
export const RunningMultipleToolCalls: Story = {
  name: 'Running / Multiple Tool Calls',
  args: {
    status: 'running',
    history: [
      createMockToolMessage('tool-listFiles', { relative_path: 'src' }),
      createMockToolMessage('tool-readFile', {
        relative_path: 'package.json',
      }),
      createMockToolMessage('tool-grepSearch', { query: 'dependencies' }),
    ],
  },
};

/**
 * Running - Absolute Path (no mounts)
 *
 * When agent uses absolute paths and no mounts are provided,
 * shows the full path.
 */
export const RunningAbsolutePathNoMounts: Story = {
  name: 'Running / Absolute Path (no mounts)',
  args: {
    status: 'running',
    history: [
      createMockToolMessage('tool-listFiles', {
        relative_path: '/Users/user/projects/my-app/src/components',
      }),
    ],
  },
};

/**
 * Running - Absolute Path (with mounts)
 *
 * When agent uses absolute paths and mounts are provided,
 * the path is relativized for display.
 * Shows "Listing files in src/components..." instead of the full path.
 */
export const RunningAbsolutePathWithMounts: Story = {
  name: 'Running / Absolute Path (with mounts)',
  args: {
    status: 'running',
    history: [
      createMockToolMessage('tool-listFiles', {
        relative_path: '/Users/user/projects/my-app/src/components',
      }),
    ],
  },
};

/**
 * Completed State
 *
 * When generation is complete, shows the file with action buttons.
 * - File icon and " generated" text
 * - "Done" button to dismiss
 * - "Show file" button to navigate to agent settings
 */
export const Completed: Story = {
  args: {
    status: 'completed',
    history: [],
  },
};

/**
 * Error - Agent Failure
 *
 * When the agent encounters an error during generation (e.g. model rate limit,
 * retries exhausted). Shows the error message from the agent in the expandable
 * content area.
 */
export const ErrorAgentFailure: Story = {
  name: 'Error / Agent Failure',
  args: {
    status: 'error',
    history: [],
    errorMessage: 'Generation failed after 2 retries: model rate limited',
  },
};

/**
 * Error - Workspace Disconnected
 *
 * When the workspace is disconnected while generation is still in progress.
 * Shows a specific disconnect message.
 */
export const ErrorWorkspaceDisconnected: Story = {
  name: 'Error / Workspace Disconnected',
  args: {
    status: 'error',
    history: [],
    errorMessage: 'Workspace disconnected during generation',
  },
};

/**
 * Error - No Message
 *
 * When an error occurs but no specific message is provided.
 * Falls back to the default tooltip text; the content area is hidden.
 */
export const ErrorNoMessage: Story = {
  name: 'Error / No Message',
  args: {
    status: 'error',
    history: [],
  },
};
