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
  createMultiEditToolPart,
  REALISTIC_TIMING,
  getRandomDuration,
} from './shared-utilities';

/**
 * Configuration for multi-file edit scenario
 */
export interface MultiFileEditScenarioConfig {
  /** User's message */
  userMessage: string;
  /** Agent's thinking text */
  thinkingText: string;
  /** Files to edit (3-4 files) */
  files: Array<{
    path: string;
    beforeContent: string;
    afterContent: string;
  }>;
  /** Agent's confirmation message */
  responseText: string;
  /** Custom thinking duration (ms) */
  thinkingDuration?: number;
  /** Enable looping */
  loop?: boolean;
}

/**
 * Multi-File Edit Scenario Decorator
 *
 * Simulates: User asks → Agent thinks → Agent edits multiple files in parallel → Agent confirms
 *
 * Timeline:
 * 1. User message appears
 * 2. Agent starts thinking
 * 3. Agent finishes thinking
 * 4. Agent initiates ALL file edits simultaneously (all start in input-streaming)
 * 5. Content streams for all tools in parallel
 * 6. Tools transition to input-available one by one (slight delays between them)
 * 7. Tools execute and return results (output-available) one by one
 * 8. Agent streams confirmation text
 *
 * Usage:
 * ```tsx
 * export const EditMultipleFiles: Story = {
 *   decorators: [withMultiFileEditScenario],
 *   parameters: {
 *     multiFileEditScenario: {
 *       userMessage: 'Refactor the button components',
 *       thinkingText: 'I need to update all button components...',
 *       files: [
 *         { path: 'src/components/Button.tsx', beforeContent: '...', afterContent: '...' },
 *         { path: 'src/components/IconButton.tsx', beforeContent: '...', afterContent: '...' },
 *         { path: 'src/components/LinkButton.tsx', beforeContent: '...', afterContent: '...' },
 *       ],
 *       responseText: "I've updated all three button components.",
 *     }
 *   }
 * };
 * ```
 */
export const withMultiFileEditScenario: Decorator = (Story, context) => {
  const config = context.parameters.multiFileEditScenario as
    | MultiFileEditScenarioConfig
    | undefined;
  const baseMockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  if (!config) {
    return <Story />;
  }

  return (
    <MultiFileEditScenarioSimulator
      config={config}
      baseMockState={baseMockState}
    >
      <Story />
    </MultiFileEditScenarioSimulator>
  );
};

interface MultiFileEditScenarioSimulatorProps {
  config: MultiFileEditScenarioConfig;
  baseMockState?: Partial<AppState>;
  children: React.ReactNode;
}

function MultiFileEditScenarioSimulator({
  config,
  baseMockState,
  children,
}: MultiFileEditScenarioSimulatorProps) {
  const [currentState, setCurrentState] = useState<Partial<AppState>>(
    baseMockState || {},
  );
  const [executor, setExecutor] = useState<TimelineExecutor | null>(null);

  useEffect(() => {
    const timeline = buildMultiFileEditTimeline(config);
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
          const timeline = buildMultiFileEditTimeline(config);
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
 * Build timeline for multi-file edit scenario
 */
function buildMultiFileEditTimeline(
  config: MultiFileEditScenarioConfig,
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

  // 6. Add ALL file edit tools simultaneously (all start at same time)
  currentTime += 200;
  const toolStartTime = currentTime;
  const toolCallIds: string[] = [];

  config.files.forEach((file, index) => {
    const toolCallId = `multi-edit-tool-${index + 1}`;
    toolCallIds.push(toolCallId);
    const partIndex = 1 + index; // partIndex 0 is reasoning

    // Add tool in input-streaming state
    timeline.push({
      type: 'update-message-part',
      timestamp: toolStartTime,
      messageId: assistantMessageId,
      partIndex,
      updater: () =>
        createMultiEditToolPart(file.path, '', 'input-streaming', {
          toolCallId,
          oldContent: file.beforeContent,
        }),
    });

    // Stream content for this tool
    const contentStreamDuration = Math.ceil(file.afterContent.length * 10);
    timeline.push({
      type: 'stream-tool-input-field',
      timestamp: toolStartTime,
      messageId: assistantMessageId,
      toolCallId,
      fieldPath: 'input.edits.0.new_string',
      targetContent: file.afterContent,
      chunkStrategy: 'char',
      intervalMs: REALISTIC_TIMING.toolInputStreaming.intervalMs,
      duration: contentStreamDuration,
    });
  });

  // 7. Calculate max streaming duration for all tools
  const maxStreamDuration = Math.max(
    ...config.files.map((f) => Math.ceil(f.afterContent.length * 10)),
  );

  // 8. Transition tools to input-available one by one (with small delays)
  currentTime =
    toolStartTime + maxStreamDuration + REALISTIC_TIMING.phaseTransition;
  config.files.forEach((file, index) => {
    const toolCallId = toolCallIds[index]!;

    timeline.push({
      type: 'update-tool-state',
      timestamp: currentTime + index * 300, // 300ms stagger
      messageId: assistantMessageId,
      toolCallId,
      newState: 'input-available',
      input: {
        relative_path: file.path,
        edits: [
          {
            old_string: file.beforeContent,
            new_string: file.afterContent,
          },
        ],
      },
    });
  });

  // 9. Transition tools to output-available one by one
  currentTime += config.files.length * 300 + 200; // After all input-available
  config.files.forEach((file, index) => {
    const toolCallId = toolCallIds[index]!;
    const _fileOpDuration = getRandomDuration(
      REALISTIC_TIMING.fileOperation.min,
      REALISTIC_TIMING.fileOperation.max,
    );

    timeline.push({
      type: 'update-tool-state',
      timestamp: currentTime + index * 400, // 400ms stagger for execution
      messageId: assistantMessageId,
      toolCallId,
      newState: 'output-available',
      output: {
        message: 'File edited successfully',
        result: {
          editsApplied: 1,
        },
        hiddenFromLLM: {
          diff: {
            path: file.path,
            before: file.beforeContent,
            after: file.afterContent,
          },
        },
        nonSerializableMetadata: {
          undoExecute: null,
        },
      },
    });
  });

  // 10. Add text response part (after all tools complete)
  currentTime += config.files.length * 400 + 300;
  const textPartIndex = 1 + config.files.length; // After reasoning + all tools
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: textPartIndex,
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
    partIndex: textPartIndex,
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
