import type { Decorator } from '@storybook/react';
import { useState, useEffect } from 'react';
import { MockKartonProvider } from '../../mocks/mock-hooks';
import type { AppState } from '@shared/karton-contracts/ui';
import { TimelineExecutor, type TimelineEvent } from './timeline-engine';
import {
  createUserMessage,
  createAssistantMessage,
  createReasoningPart,
  createTextPart,
  createOverwriteFileToolPart,
  REALISTIC_TIMING,
  getRandomDuration,
} from './shared-utilities';

/**
 * Configuration for overwrite file scenario
 */
export interface OverwriteFileScenarioConfig {
  /** User's message */
  userMessage: string;
  /** Agent's thinking text */
  thinkingText: string;
  /** Target file path */
  targetFile: string;
  /** File content to write */
  fileContent: string;
  /** Agent's confirmation message */
  responseText: string;
  /** Custom thinking duration (ms) */
  thinkingDuration?: number;
  /** Enable looping */
  loop?: boolean;
}

/**
 * Overwrite File Scenario Decorator
 *
 * Simulates: User asks → Agent thinks → Agent creates/overwrites a file → Agent confirms
 *
 * Timeline:
 * 1. User message appears
 * 2. Agent starts thinking
 * 3. Agent finishes thinking
 * 4. Agent initiates file overwrite (input-streaming)
 * 5. Content streams character by character
 * 6. Tool transitions to input-available
 * 7. Tool executes and returns result (output-available)
 * 8. Agent streams confirmation text
 *
 * Usage:
 * ```tsx
 * export const CreateHaikusFile: Story = {
 *   decorators: [withOverwriteFileScenario],
 *   parameters: {
 *     overwriteFileScenario: {
 *       userMessage: 'Create a file with 10 haikus about coding',
 *       thinkingText: 'Let me write some haikus about the art of coding...',
 *       targetFile: 'Haikus.md',
 *       fileContent: '# Coding Haikus\n\n...',
 *       responseText: "I've created Haikus.md with 10 coding-themed haikus.",
 *     }
 *   }
 * };
 * ```
 */
export const withOverwriteFileScenario: Decorator = (Story, context) => {
  const config = context.parameters.overwriteFileScenario as
    | OverwriteFileScenarioConfig
    | undefined;
  const baseMockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  if (!config) {
    return <Story />;
  }

  return (
    <OverwriteFileScenarioSimulator
      config={config}
      baseMockState={baseMockState}
    >
      <Story />
    </OverwriteFileScenarioSimulator>
  );
};

interface OverwriteFileScenarioSimulatorProps {
  config: OverwriteFileScenarioConfig;
  baseMockState?: Partial<AppState>;
  children: React.ReactNode;
}

function OverwriteFileScenarioSimulator({
  config,
  baseMockState,
  children,
}: OverwriteFileScenarioSimulatorProps) {
  const [currentState, setCurrentState] = useState<Partial<AppState>>(
    baseMockState || {},
  );
  const [executor, setExecutor] = useState<TimelineExecutor | null>(null);

  useEffect(() => {
    const timeline = buildOverwriteFileTimeline(config);
    const newExecutor = new TimelineExecutor(
      timeline,
      baseMockState || {},
      setCurrentState,
    );
    setExecutor(newExecutor);
    newExecutor.start();

    return () => newExecutor.stop();
  }, [config, baseMockState]);

  // Handle looping
  useEffect(() => {
    if (!config.loop || !executor) return;

    const checkCompletion = setInterval(() => {
      if (executor && !(executor as any).state?.isRunning) {
        setTimeout(() => {
          executor.stop();
          const timeline = buildOverwriteFileTimeline(config);
          const newExecutor = new TimelineExecutor(
            timeline,
            baseMockState || {},
            setCurrentState,
          );
          setExecutor(newExecutor);
          newExecutor.start();
        }, 1000);
      }
    }, 500);

    return () => clearInterval(checkCompletion);
  }, [config.loop, executor, baseMockState]);

  return (
    <MockKartonProvider mockState={currentState}>{children}</MockKartonProvider>
  );
}

/**
 * Build timeline for overwrite file scenario
 */
function buildOverwriteFileTimeline(
  config: OverwriteFileScenarioConfig,
): TimelineEvent[] {
  const userMessageId = 'user-msg-1';
  const assistantMessageId = 'assistant-msg-1';
  const toolCallId = 'overwrite-tool-1';

  const thinkingDuration =
    config.thinkingDuration ||
    getRandomDuration(
      REALISTIC_TIMING.thinking.min,
      REALISTIC_TIMING.thinking.max,
    );

  const timeline: TimelineEvent[] = [];
  let currentTime = 0;

  // 1. Add user message
  timeline.push({
    type: 'add-message',
    timestamp: currentTime,
    message: createUserMessage(config.userMessage, { id: userMessageId }),
  });

  // 2. Set isWorking
  currentTime += 500;
  timeline.push({
    type: 'set-is-working',
    timestamp: currentTime,
    isWorking: true,
  });

  // 3. Add assistant message with reasoning
  timeline.push({
    type: 'add-message',
    timestamp: currentTime,
    message: createAssistantMessage({
      id: assistantMessageId,
      parts: [createReasoningPart('', 'streaming')],
    }),
  });

  // 4. Stream reasoning
  timeline.push({
    type: 'stream-reasoning-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 0,
    fullText: config.thinkingText,
    chunkStrategy: 'word',
    intervalMs: REALISTIC_TIMING.textStreaming.intervalMs,
    duration: thinkingDuration,
  });

  // 5. Mark reasoning as done
  currentTime += thinkingDuration;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 0,
    updater: (part) => ({ ...part, state: 'done' as const }),
  });

  // 6. Add overwrite file tool in input-streaming state
  currentTime += 200;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 1,
    updater: () =>
      createOverwriteFileToolPart(config.targetFile, '', 'input-streaming', {
        toolCallId,
      }),
  });

  // 7. Stream file content character by character
  const contentStreamDuration = Math.ceil(config.fileContent.length * 10);
  timeline.push({
    type: 'stream-tool-input-field',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    fieldPath: 'input.content',
    targetContent: config.fileContent,
    chunkStrategy: 'char',
    intervalMs: REALISTIC_TIMING.toolInputStreaming.intervalMs,
    duration: contentStreamDuration,
  });

  // 8. Transition to input-available
  currentTime += contentStreamDuration + REALISTIC_TIMING.phaseTransition;
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    newState: 'input-available',
    input: {
      relative_path: config.targetFile,
      content: config.fileContent,
    },
  });

  // 9. Execute tool and transition to output-available
  currentTime += getRandomDuration(
    REALISTIC_TIMING.fileOperation.min,
    REALISTIC_TIMING.fileOperation.max,
  );
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    newState: 'output-available',
    output: {
      message: 'File created successfully',
      hiddenMetadata: {
        diff: {
          path: config.targetFile,
          before: '',
          after: config.fileContent,
        },
        undoExecute: null,
      },
    },
  });

  // 10. Add text response part
  currentTime += 300;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 2,
    updater: () => createTextPart('', 'streaming'),
  });

  // 11. Stream response text
  const responseStreamDuration = Math.ceil(
    config.responseText.split(' ').length *
      REALISTIC_TIMING.textStreaming.intervalMs,
  );

  timeline.push({
    type: 'stream-text-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 2,
    fullText: config.responseText,
    chunkStrategy: 'word',
    intervalMs: REALISTIC_TIMING.textStreaming.intervalMs,
    duration: responseStreamDuration,
  });

  // 12. Set isWorking to false
  currentTime += responseStreamDuration + 100;
  timeline.push({
    type: 'set-is-working',
    timestamp: currentTime,
    isWorking: false,
  });

  return timeline;
}
