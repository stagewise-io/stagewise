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
 * Configuration for error recovery scenario
 */
export interface ErrorRecoveryScenarioConfig {
  /** User's message */
  userMessage: string;
  /** Agent's initial thinking text */
  thinkingText: string;
  /** File agent attempts to edit */
  attemptedFile: string;
  /** Content agent attempts to write */
  attemptedContent: string;
  /** Error message from tool */
  errorMessage: string;
  /** Agent's explanation of the error */
  recoveryExplanation: string;
  /** Custom thinking duration (ms) */
  thinkingDuration?: number;
  /** Enable looping */
  loop?: boolean;
}

/**
 * Error Recovery Scenario Decorator
 *
 * Simulates: User asks → Agent thinks → Agent attempts edit → Tool fails → Agent explains error
 *
 * Timeline:
 * 1. User message appears
 * 2. Agent starts thinking
 * 3. Agent finishes thinking
 * 4. Agent initiates file edit (input-streaming)
 * 5. Content streams
 * 6. Tool transitions to input-available
 * 7. Tool FAILS (output-error state)
 * 8. Agent explains the error
 *
 * Usage:
 * ```tsx
 * export const HandleError: Story = {
 *   decorators: [withErrorRecoveryScenario],
 *   parameters: {
 *     errorRecoveryScenario: {
 *       userMessage: 'Delete the config file',
 *       thinkingText: 'Let me remove that file...',
 *       attemptedFile: 'config/settings.json',
 *       attemptedContent: '',
 *       errorMessage: 'Permission denied: Cannot write to config directory',
 *       recoveryExplanation: 'I encountered an error. The config directory is read-only. You will need to manually delete this file with elevated permissions.',
 *     }
 *   }
 * };
 * ```
 */
export const withErrorRecoveryScenario: Decorator = (Story, context) => {
  const config = context.parameters.errorRecoveryScenario as
    | ErrorRecoveryScenarioConfig
    | undefined;
  const baseMockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  if (!config) {
    return <Story />;
  }

  return (
    <ErrorRecoveryScenarioSimulator
      config={config}
      baseMockState={baseMockState}
    >
      <Story />
    </ErrorRecoveryScenarioSimulator>
  );
};

interface ErrorRecoveryScenarioSimulatorProps {
  config: ErrorRecoveryScenarioConfig;
  baseMockState?: Partial<AppState>;
  children: React.ReactNode;
}

function ErrorRecoveryScenarioSimulator({
  config,
  baseMockState,
  children,
}: ErrorRecoveryScenarioSimulatorProps) {
  const [currentState, setCurrentState] = useState<Partial<AppState>>(
    baseMockState || {},
  );
  const [executor, setExecutor] = useState<TimelineExecutor | null>(null);

  useEffect(() => {
    const timeline = buildErrorRecoveryTimeline(config);
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
          const timeline = buildErrorRecoveryTimeline(config);
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
 * Build timeline for error recovery scenario
 */
function buildErrorRecoveryTimeline(
  config: ErrorRecoveryScenarioConfig,
): TimelineEvent[] {
  const userMessageId = 'user-msg-1';
  const assistantMessageId = 'assistant-msg-1';
  const toolCallId = 'overwrite-file-tool-1';

  const thinkingDuration =
    config.thinkingDuration ||
    getRandomDuration(
      REALISTIC_TIMING.thinking.min,
      REALISTIC_TIMING.thinking.max,
    );

  const contentStreamDuration = Math.ceil(
    Math.max(config.attemptedContent.length, 100) * 10,
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

  // 6. Add overwrite file tool (input-streaming)
  currentTime += 200;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 1,
    updater: () =>
      createOverwriteFileToolPart(config.attemptedFile, '', 'input-streaming', {
        toolCallId,
      }),
  });

  // 7. Stream content field (if there's content to stream)
  if (config.attemptedContent.length > 0) {
    timeline.push({
      type: 'stream-tool-input-field',
      timestamp: currentTime,
      messageId: assistantMessageId,
      toolCallId,
      fieldPath: 'input.content',
      targetContent: config.attemptedContent,
      chunkStrategy: 'char',
      intervalMs: REALISTIC_TIMING.toolInputStreaming.intervalMs,
      duration: contentStreamDuration,
    });
  }

  // 8. Transition to input-available
  currentTime += contentStreamDuration + REALISTIC_TIMING.phaseTransition;
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    newState: 'input-available',
    input: {
      relative_path: config.attemptedFile,
      content: config.attemptedContent,
    },
  });

  // 9. Tool FAILS - set output-error state
  currentTime += fileOpDuration;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 1,
    updater: (part) => ({
      ...part,
      state: 'output-error' as const,
      errorText: config.errorMessage,
    }),
  });

  // 10. Add error explanation text
  currentTime += 300;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 2,
    updater: () => createTextPart('', 'streaming'),
  });

  // 11. Stream error explanation
  const explanationStreamDuration = Math.ceil(
    config.recoveryExplanation.split(' ').length *
      REALISTIC_TIMING.textStreaming.intervalMs,
  );

  timeline.push({
    type: 'stream-text-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 2,
    fullText: config.recoveryExplanation,
    chunkStrategy: 'word',
    intervalMs: REALISTIC_TIMING.textStreaming.intervalMs,
    duration: explanationStreamDuration,
  });

  // 12. Set isWorking to false
  currentTime += explanationStreamDuration + 100;
  timeline.push({
    type: 'set-is-working',
    timestamp: currentTime,
    isWorking: false,
  });

  return timeline;
}
