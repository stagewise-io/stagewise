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
  createListFilesToolPart,
  createGlobToolPart,
  createReadFileToolPart,
  createMultiEditToolPart,
  createOverwriteFileToolPart,
  createGrepSearchToolPart,
  REALISTIC_TIMING,
  getRandomDuration,
} from './shared-utilities';

/**
 * Configuration for exploration scenario
 */
export interface ExplorationScenarioConfig {
  /** User's message */
  userMessage: string;
  /** Agent's initial thinking text */
  thinkingText: string;
  /** Initial solo tool call (optional) - runs before parallel operations */
  initialTool?: {
    type: 'grep' | 'list-files';
    path?: string; // for list-files
    query?: string; // for grep
    result: any;
  };
  /** List files configuration */
  listFilesPath: string;
  listFilesResult: Array<{
    relativePath: string;
    name: string;
    type: 'file' | 'directory';
    depth: number;
  }>;
  /** Glob configuration */
  globPattern: string;
  globResult: string[];
  /** Files to read (3 files) */
  filesToRead: Array<{ path: string; content: string }>;
  /** Intermediate response after exploration */
  intermediateResponse: string;
  /** Files to edit */
  edits: Array<{
    path: string;
    beforeContent: string;
    afterContent: string;
    useMultiEdit?: boolean; // if false, uses overwrite
  }>;
  /** Final confirmation message (optional) */
  finalResponse?: string;
  /** Enable looping */
  loop?: boolean;
}

/**
 * Parallel Exploration Scenario Decorator
 *
 * Simulates complex exploration and editing flow:
 * 1. User asks → Agent thinks
 * 2. Agent calls list-files + glob in parallel → both complete
 * 3. Agent calls 3x read-file in parallel → all complete
 * 4. Agent responds (e.g., "I will now edit file xyz")
 * 5. Agent performs multi-edit + overwrite-file in parallel
 *
 * Usage:
 * ```tsx
 * export const ExploreAndEdit: Story = {
 *   decorators: [withExplorationScenario],
 *   parameters: {
 *     explorationScenario: {
 *       userMessage: 'Find and fix all button components',
 *       thinkingText: 'Let me explore the codebase...',
 *       listFilesPath: 'src/components',
 *       listFilesResult: [...],
 *       globPattern: '**\/ *.tsx',
 *       globResult: ['Button.tsx', 'IconButton.tsx'],
 *       filesToRead: [
 *         { path: 'Button.tsx', content: '...' },
 *         { path: 'IconButton.tsx', content: '...' },
 *         { path: 'LinkButton.tsx', content: '...' },
 *       ],
 *       intermediateResponse: 'I found the issues. I will now fix them.',
 *       edits: [
 *         { path: 'Button.tsx', beforeContent: '...', afterContent: '...', useMultiEdit: true },
 *         { path: 'IconButton.tsx', beforeContent: '...', afterContent: '...' },
 *       ],
 *     }
 *   }
 * };
 * ```
 */
export const withExplorationScenario: Decorator = (Story, context) => {
  const config = context.parameters.explorationScenario as
    | ExplorationScenarioConfig
    | undefined;
  const baseMockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  if (!config) {
    return <Story />;
  }

  return (
    <ExplorationScenarioSimulator config={config} baseMockState={baseMockState}>
      <Story />
    </ExplorationScenarioSimulator>
  );
};

interface ExplorationScenarioSimulatorProps {
  config: ExplorationScenarioConfig;
  baseMockState?: Partial<AppState>;
  children: React.ReactNode;
}

function ExplorationScenarioSimulator({
  config,
  baseMockState,
  children,
}: ExplorationScenarioSimulatorProps) {
  const [currentState, setCurrentState] = useState<Partial<AppState>>(
    baseMockState || {},
  );
  const [executor, setExecutor] = useState<TimelineExecutor | null>(null);

  useEffect(() => {
    const timeline = buildExplorationTimeline(config);
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
          const timeline = buildExplorationTimeline(config);
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
 * Build timeline for exploration scenario
 */
function buildExplorationTimeline(
  config: ExplorationScenarioConfig,
): TimelineEvent[] {
  const userMessageId = 'user-msg-1';
  const assistantMessageId = 'assistant-msg-1';

  const thinkingDuration = getRandomDuration(
    REALISTIC_TIMING.thinking.min,
    REALISTIC_TIMING.thinking.max,
  );

  const timeline: TimelineEvent[] = [];
  let currentTime = 0;
  let partIndex = 0;

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
    partIndex: partIndex++,
    fullText: config.thinkingText,
    chunkStrategy: 'word',
    intervalMs: REALISTIC_TIMING.textStreaming.intervalMs,
    duration: thinkingDuration,
  });

  currentTime += thinkingDuration;

  // 5. PHASE 0: Initial solo tool call (if configured)
  if (config.initialTool) {
    currentTime += 200;
    const phase0StartTime = currentTime;
    const initialToolId = 'initial-tool-1';
    const initialToolPartIndex = partIndex++;

    // Add initial tool in input-streaming
    if (config.initialTool.type === 'grep') {
      timeline.push({
        type: 'update-message-part',
        timestamp: phase0StartTime,
        messageId: assistantMessageId,
        partIndex: initialToolPartIndex,
        updater: () =>
          createGrepSearchToolPart(
            config.initialTool!.query || 'Button',
            0,
            'input-streaming',
            {
              toolCallId: initialToolId,
              explanation: 'Searching for button components',
            },
          ),
      });
    } else {
      timeline.push({
        type: 'update-message-part',
        timestamp: phase0StartTime,
        messageId: assistantMessageId,
        partIndex: initialToolPartIndex,
        updater: () =>
          createListFilesToolPart(
            config.initialTool!.path || 'src',
            [],
            'input-streaming',
            { toolCallId: initialToolId },
          ),
      });
    }

    // Transition to input-available
    currentTime = phase0StartTime + REALISTIC_TIMING.phaseTransition;
    timeline.push({
      type: 'update-tool-state',
      timestamp: currentTime,
      messageId: assistantMessageId,
      toolCallId: initialToolId,
      newState: 'input-available',
    });

    // Complete (output-available) after ~500ms
    currentTime += 500;
    timeline.push({
      type: 'update-tool-state',
      timestamp: currentTime,
      messageId: assistantMessageId,
      toolCallId: initialToolId,
      newState: 'output-available',
      output: config.initialTool.result,
    });
  }

  // 6. PHASE 1: List files + Glob in parallel
  currentTime += 200;
  const phase1StartTime = currentTime;
  const listFilesToolId = 'list-files-tool-1';
  const globToolId = 'glob-tool-1';
  const listFilesPartIndex = partIndex++;
  const globPartIndex = partIndex++;

  // Add both tools in input-streaming
  timeline.push({
    type: 'update-message-part',
    timestamp: phase1StartTime,
    messageId: assistantMessageId,
    partIndex: listFilesPartIndex,
    updater: () =>
      createListFilesToolPart(config.listFilesPath, [], 'input-streaming', {
        toolCallId: listFilesToolId,
      }),
  });

  timeline.push({
    type: 'update-message-part',
    timestamp: phase1StartTime,
    messageId: assistantMessageId,
    partIndex: globPartIndex,
    updater: () =>
      createGlobToolPart(config.globPattern, 0, 'input-streaming', {
        toolCallId: globToolId,
      }),
  });

  // Transition both to input-available
  currentTime = phase1StartTime + REALISTIC_TIMING.phaseTransition;
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId: listFilesToolId,
    newState: 'input-available',
  });

  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId: globToolId,
    newState: 'input-available',
  });

  // Both complete (output-available) with slight stagger
  currentTime += getRandomDuration(
    REALISTIC_TIMING.fileOperation.min,
    REALISTIC_TIMING.fileOperation.max,
  );
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId: listFilesToolId,
    newState: 'output-available',
    output: {
      message: `Successfully listed ${config.listFilesResult.length} items`,
      result: {
        files: config.listFilesResult,
        totalFiles: config.listFilesResult.filter((f) => f.type === 'file')
          .length,
        totalDirectories: config.listFilesResult.filter(
          (f) => f.type === 'directory',
        ).length,
        truncated: false,
        itemsRemoved: 0,
      },
    },
  });

  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime + 200,
    messageId: assistantMessageId,
    toolCallId: globToolId,
    newState: 'output-available',
    output: {
      message: `Found ${config.globResult.length} files matching "${config.globPattern}"`,
      result: {
        totalMatches: config.globResult.length,
        relativePaths: config.globResult,
        truncated: false,
        itemsRemoved: 0,
      },
    },
  });

  // 7. PHASE 2: Read 3 files in parallel
  currentTime += 500;
  const phase2StartTime = currentTime;
  const readToolIds: string[] = [];
  const readPartIndices: number[] = [];

  config.filesToRead.forEach((file, index) => {
    const toolId = `read-file-tool-${index + 1}`;
    readToolIds.push(toolId);
    const pIndex = partIndex++;
    readPartIndices.push(pIndex);

    // Add read tool in input-streaming
    timeline.push({
      type: 'update-message-part',
      timestamp: phase2StartTime,
      messageId: assistantMessageId,
      partIndex: pIndex,
      updater: () =>
        createReadFileToolPart(file.path, '', 'input-streaming', {
          toolCallId: toolId,
        }),
    });
  });

  // Transition all to input-available
  currentTime = phase2StartTime + REALISTIC_TIMING.phaseTransition;
  readToolIds.forEach((toolId) => {
    timeline.push({
      type: 'update-tool-state',
      timestamp: currentTime,
      messageId: assistantMessageId,
      toolCallId: toolId,
      newState: 'input-available',
    });
  });

  // All complete (output-available) with stagger
  currentTime += getRandomDuration(
    REALISTIC_TIMING.fileOperation.min,
    REALISTIC_TIMING.fileOperation.max,
  );
  config.filesToRead.forEach((file, index) => {
    timeline.push({
      type: 'update-tool-state',
      timestamp: currentTime + index * 250,
      messageId: assistantMessageId,
      toolCallId: readToolIds[index]!,
      newState: 'output-available',
      output: {
        success: true,
        message: 'File read successfully',
        result: {
          content: file.content,
          totalLines: file.content.split('\n').length,
          linesRead: file.content.split('\n').length,
          truncated: false,
          originalSize: file.content.length,
          cappedSize: file.content.length,
        },
      },
    });
  });

  // 8. Intermediate text response
  currentTime += config.filesToRead.length * 250 + 300;
  const intermediateTextPartIndex = partIndex++;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: intermediateTextPartIndex,
    updater: () => createTextPart('', 'streaming'),
  });

  const intermediateStreamDuration = Math.ceil(
    config.intermediateResponse.split(' ').length *
      REALISTIC_TIMING.textStreaming.intervalMs,
  );

  timeline.push({
    type: 'stream-text-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: intermediateTextPartIndex,
    fullText: config.intermediateResponse,
    chunkStrategy: 'word',
    intervalMs: REALISTIC_TIMING.textStreaming.intervalMs,
    duration: intermediateStreamDuration,
  });

  // 9. PHASE 3: Edit files in parallel
  currentTime += intermediateStreamDuration + 400;
  const phase3StartTime = currentTime;
  const editToolIds: string[] = [];

  config.edits.forEach((edit, index) => {
    const toolId = `edit-tool-${index + 1}`;
    editToolIds.push(toolId);
    const pIndex = partIndex++;

    // Add edit tool (multi-edit or overwrite)
    timeline.push({
      type: 'update-message-part',
      timestamp: phase3StartTime,
      messageId: assistantMessageId,
      partIndex: pIndex,
      updater: () =>
        edit.useMultiEdit
          ? createMultiEditToolPart(edit.path, '', 'input-streaming', {
              toolCallId: toolId,
              oldContent: edit.beforeContent,
            })
          : createOverwriteFileToolPart(edit.path, '', 'input-streaming', {
              toolCallId: toolId,
              oldContent: edit.beforeContent,
            }),
    });

    // Stream content
    const contentStreamDuration = Math.ceil(edit.afterContent.length * 10);
    const fieldPath = edit.useMultiEdit
      ? 'input.edits.0.new_string'
      : 'input.content';

    timeline.push({
      type: 'stream-tool-input-field',
      timestamp: phase3StartTime,
      messageId: assistantMessageId,
      toolCallId: toolId,
      fieldPath,
      targetContent: edit.afterContent,
      chunkStrategy: 'char',
      intervalMs: REALISTIC_TIMING.toolInputStreaming.intervalMs,
      duration: contentStreamDuration,
    });
  });

  // Calculate max streaming duration
  const maxEditStreamDuration = Math.max(
    ...config.edits.map((e) => Math.ceil(e.afterContent.length * 10)),
  );

  // Transition to input-available
  currentTime =
    phase3StartTime + maxEditStreamDuration + REALISTIC_TIMING.phaseTransition;
  config.edits.forEach((edit, index) => {
    timeline.push({
      type: 'update-tool-state',
      timestamp: currentTime + index * 200,
      messageId: assistantMessageId,
      toolCallId: editToolIds[index]!,
      newState: 'input-available',
      input: edit.useMultiEdit
        ? {
            relative_path: edit.path,
            edits: [
              {
                old_string: edit.beforeContent,
                new_string: edit.afterContent,
              },
            ],
          }
        : {
            relative_path: edit.path,
            content: edit.afterContent,
          },
    });
  });

  // Transition to output-available
  currentTime += config.edits.length * 200 + 200;
  config.edits.forEach((edit, index) => {
    timeline.push({
      type: 'update-tool-state',
      timestamp: currentTime + index * 300,
      messageId: assistantMessageId,
      toolCallId: editToolIds[index]!,
      newState: 'output-available',
      output: {
        message: edit.useMultiEdit
          ? 'File edited successfully'
          : 'File updated successfully',
        ...(edit.useMultiEdit && {
          result: {
            editsApplied: 1,
          },
        }),
        hiddenMetadata: {
          diff: {
            path: edit.path,
            before: edit.beforeContent,
            after: edit.afterContent,
          },
          undoExecute: null,
        },
      },
    });
  });

  // 10. Final response (optional)
  if (config.finalResponse) {
    currentTime += config.edits.length * 300 + 300;
    const finalTextPartIndex = partIndex++;
    timeline.push({
      type: 'update-message-part',
      timestamp: currentTime,
      messageId: assistantMessageId,
      partIndex: finalTextPartIndex,
      updater: () => createTextPart('', 'streaming'),
    });

    const finalStreamDuration = Math.ceil(
      config.finalResponse.split(' ').length *
        REALISTIC_TIMING.textStreaming.intervalMs,
    );

    timeline.push({
      type: 'stream-text-part',
      timestamp: currentTime,
      messageId: assistantMessageId,
      partIndex: finalTextPartIndex,
      fullText: config.finalResponse,
      chunkStrategy: 'word',
      intervalMs: REALISTIC_TIMING.textStreaming.intervalMs,
      duration: finalStreamDuration,
    });

    currentTime += finalStreamDuration;
  }

  // 11. Set isWorking to false
  currentTime += 100;
  timeline.push({
    type: 'set-is-working',
    timestamp: currentTime,
    isWorking: false,
  });

  return timeline;
}
