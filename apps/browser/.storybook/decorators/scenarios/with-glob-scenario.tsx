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
  createGlobToolPart,
  REALISTIC_TIMING,
  getRandomDuration,
} from './shared-utilities';

/**
 * Configuration for glob pattern search scenario
 */
export interface GlobScenarioConfig {
  /** User's message */
  userMessage: string;
  /** Agent's thinking text */
  thinkingText: string;
  /** Glob pattern to search */
  pattern: string;
  /** Number of matches found */
  totalMatches: number;
  /** Optional relative path context */
  relativePath?: string;
  /** Agent's response message */
  responseText: string;
  /** Custom thinking duration (ms) */
  thinkingDuration?: number;
  /** Enable looping */
  loop?: boolean;
}

/**
 * Glob Scenario Decorator
 *
 * Simulates: User asks → Agent thinks → Agent searches with glob → Agent responds
 *
 * Timeline:
 * 1. User message appears
 * 2. Agent starts thinking
 * 3. Agent finishes thinking
 * 4. Agent initiates glob search (input-streaming)
 * 5. Tool transitions to input-available
 * 6. Tool executes and returns results (output-available with matches)
 * 7. Agent streams response text
 *
 * Usage:
 * ```tsx
 * export const FindComponents: Story = {
 *   decorators: [withGlobScenario],
 *   parameters: {
 *     globScenario: {
 *       userMessage: 'Find all React component files',
 *       thinkingText: 'Let me search for all .tsx files...',
 *       pattern: 'star-star-slash-star-dot-tsx',
 *       totalMatches: 15,
 *       responseText: "I found 15 TypeScript React files in your project.",
 *     }
 *   }
 * };
 * ```
 */
export const withGlobScenario: Decorator = (Story, context) => {
  const config = context.parameters.globScenario as
    | GlobScenarioConfig
    | undefined;
  const baseMockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  if (!config) {
    return <Story />;
  }

  return (
    <GlobScenarioSimulator config={config} baseMockState={baseMockState}>
      <Story />
    </GlobScenarioSimulator>
  );
};

interface GlobScenarioSimulatorProps {
  config: GlobScenarioConfig;
  baseMockState?: Partial<AppState>;
  children: React.ReactNode;
}

function GlobScenarioSimulator({
  config,
  baseMockState,
  children,
}: GlobScenarioSimulatorProps) {
  const [currentState, setCurrentState] = useState<Partial<AppState>>(
    baseMockState || {},
  );
  const [executor, setExecutor] = useState<TimelineExecutor | null>(null);

  useEffect(() => {
    const timeline = buildGlobTimeline(config);
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
          const timeline = buildGlobTimeline(config);
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
 * Build timeline for glob search scenario
 */
function buildGlobTimeline(config: GlobScenarioConfig): TimelineEvent[] {
  const userMessageId = 'user-msg-1';
  const assistantMessageId = 'assistant-msg-1';
  const toolCallId = 'glob-tool-1';

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

  // 6. Add glob tool (input-streaming)
  currentTime += 200;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 1,
    updater: () =>
      createGlobToolPart(config.pattern, 0, 'input-streaming', {
        relativePath: config.relativePath,
      }),
  });

  // 7. Stream pattern field
  const patternStreamDuration = Math.ceil(config.pattern.length * 30);
  timeline.push({
    type: 'stream-tool-input-field',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    fieldPath: 'input.pattern',
    targetContent: config.pattern,
    chunkStrategy: 'char',
    intervalMs: REALISTIC_TIMING.toolInputStreaming.intervalMs,
    duration: patternStreamDuration,
  });

  // 8. Transition to input-available
  currentTime += patternStreamDuration + REALISTIC_TIMING.phaseTransition;
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    newState: 'input-available',
    input: {
      pattern: config.pattern,
      relative_path: config.relativePath,
    },
  });

  // 9. Transition to output-available (search completed successfully)
  currentTime += fileOpDuration;
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    newState: 'output-available',
    output: {
      message: `Found ${config.totalMatches} files matching "${config.pattern}"`,
      result: {
        totalMatches: config.totalMatches,
        relativePaths: [],
        truncated: false,
        itemsRemoved: 0,
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
