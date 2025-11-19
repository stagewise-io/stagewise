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
  REALISTIC_TIMING,
  getRandomDuration,
} from './shared-utilities';

/**
 * Configuration for simple response scenario
 */
export interface SimpleResponseScenarioConfig {
  /** User's message */
  userMessage: string;
  /** Agent's thinking/reasoning text */
  thinkingText: string;
  /** Agent's response text */
  responseText: string;
  /** Custom thinking duration (ms), defaults to 2000-3000ms */
  thinkingDuration?: number;
  /** Enable looping (defaults to false) */
  loop?: boolean;
}

/**
 * Simple Response Scenario Decorator
 *
 * Simulates: User asks → Agent thinks → Agent responds with text
 *
 * Timeline:
 * 1. User message appears
 * 2. Agent starts thinking (reasoning part streams)
 * 3. Agent finishes thinking
 * 4. Agent streams text response
 *
 * Usage:
 * ```tsx
 * export const SimpleQuery: Story = {
 *   decorators: [withSimpleResponseScenario],
 *   parameters: {
 *     simpleResponseScenario: {
 *       userMessage: 'What is React?',
 *       thinkingText: 'Let me explain React...',
 *       responseText: 'React is a JavaScript library for building user interfaces.',
 *     },
 *     mockKartonState: { ...baseState }
 *   }
 * };
 * ```
 */
export const withSimpleResponseScenario: Decorator = (Story, context) => {
  const config = context.parameters.simpleResponseScenario as
    | SimpleResponseScenarioConfig
    | undefined;
  const baseMockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  // If no config, just render normally
  if (!config) {
    return <Story />;
  }

  return (
    <SimpleResponseScenarioSimulator
      config={config}
      baseMockState={baseMockState}
    >
      <Story />
    </SimpleResponseScenarioSimulator>
  );
};

interface SimpleResponseScenarioSimulatorProps {
  config: SimpleResponseScenarioConfig;
  baseMockState?: Partial<AppState>;
  children: React.ReactNode;
}

function SimpleResponseScenarioSimulator({
  config,
  baseMockState,
  children,
}: SimpleResponseScenarioSimulatorProps) {
  const [currentState, setCurrentState] = useState<Partial<AppState>>(
    baseMockState || {},
  );
  const [executor, setExecutor] = useState<TimelineExecutor | null>(null);

  useEffect(() => {
    // Build timeline
    const timeline = buildSimpleResponseTimeline(config);

    // Create executor
    const newExecutor = new TimelineExecutor(
      timeline,
      baseMockState || {},
      (newState) => {
        setCurrentState(newState);
      },
    );

    setExecutor(newExecutor);

    // Start execution
    newExecutor.start();

    // Cleanup on unmount
    return () => {
      newExecutor.stop();
    };
  }, [config, baseMockState]);

  // Handle looping
  useEffect(() => {
    if (!config.loop || !executor) return;

    // When timeline completes and loop is enabled, restart after a delay
    const checkCompletion = setInterval(() => {
      // Check if executor is no longer running (timeline complete)
      if (executor && !(executor as any).state?.isRunning) {
        // Restart after 1 second pause
        setTimeout(() => {
          executor.stop();
          const timeline = buildSimpleResponseTimeline(config);
          const newExecutor = new TimelineExecutor(
            timeline,
            baseMockState || {},
            (newState) => {
              setCurrentState(newState);
            },
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
 * Build timeline for simple response scenario
 */
function buildSimpleResponseTimeline(
  config: SimpleResponseScenarioConfig,
): TimelineEvent[] {
  const userMessageId = 'user-msg-1';
  const assistantMessageId = 'assistant-msg-1';

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

  // 2. Set isWorking to true
  currentTime += 500;
  timeline.push({
    type: 'set-is-working',
    timestamp: currentTime,
    isWorking: true,
  });

  // 3. Add assistant message with reasoning part (starts empty, state: streaming)
  timeline.push({
    type: 'add-message',
    timestamp: currentTime,
    message: createAssistantMessage({
      id: assistantMessageId,
      parts: [createReasoningPart('', 'streaming')],
    }),
  });

  // 4. Stream reasoning text
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

  // 5. Mark reasoning as done (update state)
  currentTime += thinkingDuration;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 0,
    updater: (part) => ({
      ...part,
      state: 'done' as const,
    }),
  });

  // 6. Add text part (starts empty, state: streaming)
  currentTime += 200; // Small pause between thinking and response
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 1, // Index 1 because reasoning is at 0
    updater: () => createTextPart('', 'streaming'),
  });

  // 7. Stream response text
  const responseStreamDuration = Math.ceil(
    config.responseText.split(' ').length *
      REALISTIC_TIMING.textStreaming.intervalMs,
  );

  timeline.push({
    type: 'stream-text-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 1,
    fullText: config.responseText,
    chunkStrategy: 'word',
    intervalMs: REALISTIC_TIMING.textStreaming.intervalMs,
    duration: responseStreamDuration,
  });

  // 8. Set isWorking to false
  currentTime += responseStreamDuration + 100;
  timeline.push({
    type: 'set-is-working',
    timestamp: currentTime,
    isWorking: false,
  });

  return timeline;
}
