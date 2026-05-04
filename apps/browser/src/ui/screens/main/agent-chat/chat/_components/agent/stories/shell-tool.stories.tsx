import type { Meta, StoryObj } from '@storybook/react';
import { ChatHistory } from '../../chat-history';
import { withMockKarton } from '@sb/decorators/with-mock-karton';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import {
  createUserMessage,
  createAssistantMessageWithText as createAssistantMessage,
  createReasoningPart as createThinkingPart,
  createExecuteShellCommandToolPart,
  createDefaultAgentState,
  DEFAULT_STORY_AGENT_ID,
} from '@sb/decorators/scenarios/shared-utilities';

const SHELL_TOOL_CALL_ID = 'shell-tc-001';

const createStoryState = (
  messages: AgentMessage[],
  options?: {
    isWorking?: boolean;
    additionalState?: Record<string, any>;
  },
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
      ...options?.additionalState,
    },
  );

const meta: Meta<typeof ChatHistory> = {
  title: 'Agent/Shell Tool',
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
 * Shell command in streaming state (no output yet).
 */
export const ShellStreaming: Story = {
  name: 'Shell/Streaming',
  parameters: {
    mockKartonState: createStoryState(
      [
        createUserMessage('Install the dependencies'),
        createAssistantMessage(
          'Let me install the project dependencies for you.',
          {
            thinkingPart: createThinkingPart(
              'I need to run pnpm install in the workspace root...',
              'done',
            ),
            toolParts: [
              createExecuteShellCommandToolPart(
                'pnpm install',
                'input-streaming',
              ),
            ],
          },
        ),
      ],
      { isWorking: true },
    ),
  },
};

/**
 * Shell command streaming with live output visible via pendingShellOutputs.
 */
export const ShellStreamingWithOutput: Story = {
  name: 'Shell/Streaming-With-Output',
  parameters: {
    mockKartonState: createStoryState(
      [
        createUserMessage('Install the dependencies'),
        createAssistantMessage(
          'Let me install the project dependencies for you.',
          {
            thinkingPart: createThinkingPart(
              'I need to run pnpm install in the workspace root...',
              'done',
            ),
            toolParts: [
              createExecuteShellCommandToolPart(
                'pnpm install',
                'input-streaming',
                { toolCallId: SHELL_TOOL_CALL_ID },
              ),
            ],
          },
        ),
      ],
      {
        isWorking: true,
        additionalState: {
          toolbox: {
            [DEFAULT_STORY_AGENT_ID]: {
              workspace: { mounts: [] },
              pendingFileDiffs: [],
              editSummary: [],
              pendingUserQuestion: null,
              pendingShellOutputs: {
                [SHELL_TOOL_CALL_ID]: [
                  'Lockfile is up to date, resolution step is skipped\n',
                  'Progress: resolved 847, reused 845, downloaded 2, added 0\n',
                  'packages are hard linked from the content-addressable store\n',
                  '\n',
                  'devDependencies:\n',
                  '+ @biomejs/biome 1.9.4\n',
                  '+ turbo 2.5.4\n',
                ],
              },
            },
          },
        },
      },
    ),
  },
};

/**
 * Completed shell command with exit code 0.
 */
export const ShellSuccessExit0: Story = {
  name: 'Shell/Success-Exit-0',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('List the files in the project root'),
      createAssistantMessage(
        'Here are the files in the project root directory.',
        {
          thinkingPart: createThinkingPart(
            'I will run ls -la to list the files...',
            'done',
          ),
          toolParts: [
            createExecuteShellCommandToolPart('ls -la', 'output-available', {
              exit_code: 0,
              output: [
                'total 120',
                'drwxr-xr-x  18 user  staff    576 Feb 27 10:30 .',
                'drwxr-xr-x   5 user  staff    160 Feb 25 09:00 ..',
                '-rw-r--r--   1 user  staff    512 Feb 27 10:30 .gitignore',
                'drwxr-xr-x   6 user  staff    192 Feb 27 10:30 apps',
                'drwxr-xr-x   4 user  staff    128 Feb 27 10:30 packages',
                '-rw-r--r--   1 user  staff   1024 Feb 27 10:30 package.json',
                '-rw-r--r--   1 user  staff    256 Feb 27 10:30 pnpm-workspace.yaml',
                '-rw-r--r--   1 user  staff   2048 Feb 27 10:30 turbo.json',
                '-rw-r--r--   1 user  staff    768 Feb 27 10:30 tsconfig.json',
              ].join('\n'),
            }),
          ],
        },
      ),
    ]),
  },
};

/**
 * Completed shell command with non-zero exit code.
 */
export const ShellNonZeroExit: Story = {
  name: 'Shell/Non-Zero-Exit',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Run the tests'),
      createAssistantMessage(
        'The test suite failed with 2 failing tests. Let me look into the failures.',
        {
          thinkingPart: createThinkingPart(
            'I will run pnpm test to check the test suite...',
            'done',
          ),
          toolParts: [
            createExecuteShellCommandToolPart('pnpm test', 'output-available', {
              exit_code: 1,
              output: [
                ' RUN  v3.0.0 /Users/user/project',
                '',
                ' ✓ src/utils.test.ts (3 tests) 12ms',
                ' ✗ src/shell.test.ts (2 tests) 45ms',
                '   ✗ detects zsh on macOS',
                '   ✗ kills process group on timeout',
                '',
                ' Test Files  1 failed | 1 passed (2)',
                ' Tests       2 failed | 3 passed (5)',
                ' Duration    1.23s',
              ].join('\n'),
            }),
          ],
        },
      ),
    ]),
  },
};

/**
 * Shell command that timed out.
 */
export const ShellTimedOut: Story = {
  name: 'Shell/Timed-Out',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Start the dev server'),
      createAssistantMessage(
        'The command timed out after 2 minutes. The dev server may still be starting up.',
        {
          toolParts: [
            createExecuteShellCommandToolPart('pnpm dev', 'output-available', {
              exit_code: null,
              timed_out: true,
              output:
                'Starting dev server...\nCompiling packages...\n[vite] watching for changes...',
            }),
          ],
        },
      ),
    ]),
  },
};

/**
 * Shell command that was cancelled by the user.
 */
export const ShellAborted: Story = {
  name: 'Shell/Aborted',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Run the full build'),
      createAssistantMessage(
        'The build was cancelled. Let me know if you want to try again.',
        {
          toolParts: [
            createExecuteShellCommandToolPart(
              'pnpm build',
              'output-available',
              {
                exit_code: null,
                session_exited: true,
                output: 'Building packages...\n@stagewise/karton: build...',
              },
            ),
          ],
        },
      ),
    ]),
  },
};

/**
 * Shell tool-level error (e.g. service unavailable).
 */
export const ShellError: Story = {
  name: 'Shell/Error',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Check the git status'),
      createAssistantMessage(
        'I was unable to run the shell command. The shell service appears to be unavailable.',
        {
          toolParts: [
            createExecuteShellCommandToolPart('git status', 'output-error', {
              errorText: 'Shell service is not available — no shell detected.',
            }),
          ],
        },
      ),
    ]),
  },
};

/**
 * Shell command awaiting user approval (Allow / Deny buttons visible).
 */
export const ShellApprovalRequested: Story = {
  name: 'Shell/Approval-Requested',
  parameters: {
    mockKartonState: createStoryState(
      [
        createUserMessage('Delete the dist folder'),
        createAssistantMessage(
          'I need to run a shell command to delete the dist folder. Please approve the command.',
          {
            toolParts: [
              createExecuteShellCommandToolPart(
                'rm -rf dist/',
                'approval-requested',
              ),
            ],
          },
        ),
      ],
      { isWorking: true },
    ),
  },
};

/**
 * Shell command that was denied by the user.
 */
export const ShellApprovalDenied: Story = {
  name: 'Shell/Approval-Denied',
  parameters: {
    mockKartonState: createStoryState([
      createUserMessage('Delete the dist folder'),
      createAssistantMessage(
        'The command was denied. I will not delete the dist folder.',
        {
          toolParts: [
            createExecuteShellCommandToolPart('rm -rf dist/', 'output-denied', {
              approvalReason: 'User denied',
            }),
          ],
        },
      ),
    ]),
  },
};

/**
 * Shell command approved and now executing (transient state).
 */
export const ShellApprovalResponded: Story = {
  name: 'Shell/Approval-Responded',
  parameters: {
    mockKartonState: createStoryState(
      [
        createUserMessage('Delete the dist folder'),
        createAssistantMessage('Running the approved command now...', {
          toolParts: [
            createExecuteShellCommandToolPart(
              'rm -rf dist/',
              'approval-responded',
              { approved: true },
            ),
          ],
        }),
      ],
      { isWorking: true },
    ),
  },
};
