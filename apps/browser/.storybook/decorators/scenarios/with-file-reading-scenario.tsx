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
  createReadFileToolPart,
  REALISTIC_TIMING,
  getRandomDuration,
} from './shared-utilities';

/**
 * Configuration for file reading scenario
 */
export interface FileReadingScenarioConfig {
  /** User's message */
  userMessage: string;
  /** Agent's thinking text */
  thinkingText: string;
  /** File to read */
  targetFile: string;
  /** File content */
  fileContent: string;
  /** Agent's response text after reading */
  responseText: string;
  /** Custom thinking duration (ms) */
  thinkingDuration?: number;
  /** Enable looping */
  loop?: boolean;
}

/**
 * File Reading Scenario Decorator
 *
 * Simulates: User asks → Agent thinks → Agent reads file → Agent responds
 *
 * Timeline:
 * 1. User message appears
 * 2. Agent starts thinking
 * 3. Agent finishes thinking
 * 4. Agent initiates file read (input-streaming)
 * 5. Tool transitions to input-available
 * 6. Tool executes and returns result (output-available)
 * 7. Agent streams text response
 *
 * Usage:
 * ```tsx
 * export const ReadFile: Story = {
 *   decorators: [withFileReadingScenario],
 *   parameters: {
 *     fileReadingScenario: {
 *       userMessage: 'What does the Button component do?',
 *       thinkingText: 'Let me read the Button component...',
 *       targetFile: 'src/components/Button.tsx',
 *       fileContent: 'export const Button = ...',
 *       responseText: 'The Button component renders a clickable button.',
 *     }
 *   }
 * };
 * ```
 */
export const withFileReadingScenario: Decorator = (Story, context) => {
  const config = context.parameters.fileReadingScenario as
    | FileReadingScenarioConfig
    | undefined;
  const baseMockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  if (!config) {
    return <Story />;
  }

  return (
    <FileReadingScenarioSimulator config={config} baseMockState={baseMockState}>
      <Story />
    </FileReadingScenarioSimulator>
  );
};

interface FileReadingScenarioSimulatorProps {
  config: FileReadingScenarioConfig;
  baseMockState?: Partial<AppState>;
  children: React.ReactNode;
}

function FileReadingScenarioSimulator({
  config,
  baseMockState,
  children,
}: FileReadingScenarioSimulatorProps) {
  const [currentState, setCurrentState] = useState<Partial<AppState>>(
    baseMockState || {},
  );
  const [executor, setExecutor] = useState<TimelineExecutor | null>(null);

  useEffect(() => {
    const timeline = buildFileReadingTimeline(config);
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
          const timeline = buildFileReadingTimeline(config);
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
 * Build timeline for file reading scenario
 */
function buildFileReadingTimeline(
  config: FileReadingScenarioConfig,
): TimelineEvent[] {
  const userMessageId = 'user-msg-1';
  const assistantMessageId = 'assistant-msg-1';
  const toolCallId = 'read-file-tool-1';

  const thinkingDuration =
    config.thinkingDuration ||
    getRandomDuration(
      REALISTIC_TIMING.thinking.min,
      REALISTIC_TIMING.thinking.max,
    );

  const fileOpDuration = getRandomDuration(
    REALISTIC_TIMING.fileOperation.min,
    REALISTIC_TIMING.fileOperation.max,
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

  // 6. Add read file tool (input-streaming)
  currentTime += 200;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 1,
    updater: () =>
      createReadFileToolPart(config.targetFile, '', 'input-streaming', {
        toolCallId,
      }),
  });

  // 7. Transition to input-available
  currentTime += REALISTIC_TIMING.phaseTransition;
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    newState: 'input-available',
    input: {
      relative_path: config.targetFile,
      explanation: 'Reading file',
    },
  });

  // 8. Transition to output-available (file read complete)
  currentTime += fileOpDuration;
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    newState: 'output-available',
    output: {
      success: true,
      message: 'File read successfully',
      result: {
        content: config.fileContent,
        totalLines: config.fileContent.split('\n').length,
        linesRead: config.fileContent.split('\n').length,
        truncated: false,
        originalSize: config.fileContent.length,
        cappedSize: config.fileContent.length,
      },
    },
  });

  // 9. Add text response part
  currentTime += 300;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 2,
    updater: () => createTextPart('', 'streaming'),
  });

  // 10. Stream response text
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

  // 11. Set isWorking to false
  currentTime += responseStreamDuration + 100;
  timeline.push({
    type: 'set-is-working',
    timestamp: currentTime,
    isWorking: false,
  });

  return timeline;
}
