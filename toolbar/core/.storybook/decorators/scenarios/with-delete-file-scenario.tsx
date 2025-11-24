import type { Decorator } from '@storybook/react';
import { useState, useEffect } from 'react';
import { MockKartonProvider } from '../../mocks/mock-hooks';
import type { AppState } from '@stagewise/karton-contract';
import { TimelineExecutor, type TimelineEvent } from './timeline-engine';
import {
  createUserMessage,
  createAssistantMessage,
  createReasoningPart,
  createTextPart,
  createDeleteFileToolPart,
  REALISTIC_TIMING,
  getRandomDuration,
} from './shared-utilities';

/**
 * Configuration for delete file scenario
 */
export interface DeleteFileScenarioConfig {
  /** User's message */
  userMessage: string;
  /** Agent's thinking text */
  thinkingText: string;
  /** File to delete */
  targetFile: string;
  /** Content of file being deleted (for diff display) */
  deletedContent: string;
  /** Agent's confirmation message */
  responseText: string;
  /** Custom thinking duration (ms) */
  thinkingDuration?: number;
  /** Enable looping */
  loop?: boolean;
}

/**
 * Delete File Scenario Decorator
 *
 * Simulates: User asks → Agent thinks → Agent deletes file → Agent confirms
 *
 * Timeline:
 * 1. User message appears
 * 2. Agent starts thinking
 * 3. Agent finishes thinking
 * 4. Agent initiates file deletion (input-streaming)
 * 5. Tool transitions to input-available
 * 6. Tool executes and returns result (output-available with diff)
 * 7. Agent streams confirmation text
 *
 * Usage:
 * ```tsx
 * export const DeleteOldFile: Story = {
 *   decorators: [withDeleteFileScenario],
 *   parameters: {
 *     deleteFileScenario: {
 *       userMessage: 'Delete the deprecated config file',
 *       thinkingText: 'I will remove the old configuration file...',
 *       targetFile: 'config/deprecated.json',
 *       deletedContent: '{"version": "1.0.0"}',
 *       responseText: "I've deleted the deprecated config file.",
 *     }
 *   }
 * };
 * ```
 */
export const withDeleteFileScenario: Decorator = (Story, context) => {
  const config = context.parameters.deleteFileScenario as
    | DeleteFileScenarioConfig
    | undefined;
  const baseMockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  if (!config) {
    return <Story />;
  }

  return (
    <DeleteFileScenarioSimulator config={config} baseMockState={baseMockState}>
      <Story />
    </DeleteFileScenarioSimulator>
  );
};

interface DeleteFileScenarioSimulatorProps {
  config: DeleteFileScenarioConfig;
  baseMockState?: Partial<AppState>;
  children: React.ReactNode;
}

function DeleteFileScenarioSimulator({
  config,
  baseMockState,
  children,
}: DeleteFileScenarioSimulatorProps) {
  const [currentState, setCurrentState] = useState<Partial<AppState>>(
    baseMockState || {},
  );
  const [executor, setExecutor] = useState<TimelineExecutor | null>(null);

  useEffect(() => {
    const timeline = buildDeleteFileTimeline(config);
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
          const timeline = buildDeleteFileTimeline(config);
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
 * Build timeline for delete file scenario
 */
function buildDeleteFileTimeline(
  config: DeleteFileScenarioConfig,
): TimelineEvent[] {
  const userMessageId = 'user-msg-1';
  const assistantMessageId = 'assistant-msg-1';
  const toolCallId = 'delete-file-tool-1';

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

  // 6. Add delete file tool (input-streaming)
  currentTime += 200;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 1,
    updater: () =>
      createDeleteFileToolPart(config.targetFile, 'input-streaming'),
  });

  // 7. Stream path field (simulating gradual input)
  const pathStreamDuration = Math.ceil(config.targetFile.length * 30);
  timeline.push({
    type: 'stream-tool-input-field',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    fieldPath: 'input.relative_path',
    targetContent: config.targetFile,
    chunkStrategy: 'char',
    intervalMs: REALISTIC_TIMING.toolInputStreaming.intervalMs,
    duration: pathStreamDuration,
  });

  // 8. Transition to input-available
  currentTime += pathStreamDuration + REALISTIC_TIMING.phaseTransition;
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    newState: 'input-available',
    input: {
      relative_path: config.targetFile,
    },
  });

  // 9. Transition to output-available (file deleted successfully)
  currentTime += fileOpDuration;
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    newState: 'output-available',
    output: {
      message: 'File deleted successfully',
      hiddenMetadata: {
        diff: {
          path: config.targetFile,
          before: config.deletedContent,
          after: '',
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
