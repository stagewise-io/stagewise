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
  createListFilesToolPart,
  REALISTIC_TIMING,
  getRandomDuration,
} from './shared-utilities';

/**
 * Configuration for list files scenario
 */
export interface ListFilesScenarioConfig {
  /** User's message */
  userMessage: string;
  /** Agent's thinking text */
  thinkingText: string;
  /** Directory to list */
  targetPath: string;
  /** List of files/directories found */
  files: Array<{
    relativePath: string;
    name: string;
    type: 'file' | 'directory';
    size?: number;
    depth: number;
  }>;
  /** List options */
  options?: {
    recursive?: boolean;
    pattern?: string;
    maxDepth?: number;
  };
  /** Agent's response message */
  responseText: string;
  /** Custom thinking duration (ms) */
  thinkingDuration?: number;
  /** Enable looping */
  loop?: boolean;
}

/**
 * List Files Scenario Decorator
 *
 * Simulates: User asks → Agent thinks → Agent lists files → Agent responds
 *
 * Timeline:
 * 1. User message appears
 * 2. Agent starts thinking
 * 3. Agent finishes thinking
 * 4. Agent initiates list files (input-streaming)
 * 5. Tool transitions to input-available
 * 6. Tool executes and returns results (output-available with file list)
 * 7. Agent streams response text
 *
 * Usage:
 * ```tsx
 * export const ListComponents: Story = {
 *   decorators: [withListFilesScenario],
 *   parameters: {
 *     listFilesScenario: {
 *       userMessage: 'Show me all files in the components directory',
 *       thinkingText: 'Let me list the files in the components directory...',
 *       targetPath: 'src/components',
 *       files: [
 *         { relativePath: 'src/components/Button.tsx', name: 'Button.tsx', type: 'file', depth: 0 },
 *         { relativePath: 'src/components/Card.tsx', name: 'Card.tsx', type: 'file', depth: 0 },
 *       ],
 *       responseText: "I found 2 component files in the directory.",
 *     }
 *   }
 * };
 * ```
 */
export const withListFilesScenario: Decorator = (Story, context) => {
  const config = context.parameters.listFilesScenario as
    | ListFilesScenarioConfig
    | undefined;
  const baseMockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  if (!config) {
    return <Story />;
  }

  return (
    <ListFilesScenarioSimulator config={config} baseMockState={baseMockState}>
      <Story />
    </ListFilesScenarioSimulator>
  );
};

interface ListFilesScenarioSimulatorProps {
  config: ListFilesScenarioConfig;
  baseMockState?: Partial<AppState>;
  children: React.ReactNode;
}

function ListFilesScenarioSimulator({
  config,
  baseMockState,
  children,
}: ListFilesScenarioSimulatorProps) {
  const [currentState, setCurrentState] = useState<Partial<AppState>>(
    baseMockState || {},
  );
  const [executor, setExecutor] = useState<TimelineExecutor | null>(null);

  useEffect(() => {
    const timeline = buildListFilesTimeline(config);
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
          const timeline = buildListFilesTimeline(config);
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
 * Build timeline for list files scenario
 */
function buildListFilesTimeline(
  config: ListFilesScenarioConfig,
): TimelineEvent[] {
  const userMessageId = 'user-msg-1';
  const assistantMessageId = 'assistant-msg-1';
  const toolCallId = 'list-files-tool-1';

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

  // 6. Add list files tool (input-streaming)
  currentTime += 200;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: 1,
    updater: () =>
      createListFilesToolPart(config.targetPath, [], 'input-streaming', {
        ...config.options,
        toolCallId,
      }),
  });

  // 7. Stream path field
  const pathStreamDuration = Math.ceil(config.targetPath.length * 30);
  timeline.push({
    type: 'stream-tool-input-field',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    fieldPath: 'input.relative_path',
    targetContent: config.targetPath,
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
      relative_path: config.targetPath,
      recursive: config.options?.recursive ?? false,
      pattern: config.options?.pattern,
      maxDepth: config.options?.maxDepth,
    },
  });

  // 9. Transition to output-available (files listed successfully)
  currentTime += fileOpDuration;
  const totalFiles = config.files.filter((f) => f.type === 'file').length;
  const totalDirectories = config.files.filter(
    (f) => f.type === 'directory',
  ).length;

  let message = `Successfully listed ${config.files.length} items in: ${config.targetPath}`;
  if (config.options?.recursive) {
    message += ` (recursive${config.options?.maxDepth !== undefined ? `, max depth ${config.options.maxDepth}` : ''})`;
  }
  if (config.options?.pattern) {
    message += ` (filtered by pattern: ${config.options.pattern})`;
  }
  message += ` - ${totalFiles} files, ${totalDirectories} directories`;

  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId,
    newState: 'output-available',
    output: {
      message,
      result: {
        files: config.files,
        totalFiles,
        totalDirectories,
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
