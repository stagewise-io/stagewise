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
  createMultiEditToolPart,
  REALISTIC_TIMING,
  getRandomDuration,
} from './shared-utilities';

/**
 * Configuration for complex refactoring scenario
 */
export interface ComplexRefactoringScenarioConfig {
  /** User's message */
  userMessage: string;
  /** Phase 1: Initial exploration */
  phase1: {
    thinkingText: string;
    filesToRead: Array<{ path: string; content: string }>;
  };
  /** Phase 2: Initial edits */
  phase2: {
    intermediateText: string;
    initialEdits: Array<{
      path: string;
      beforeContent: string;
      afterContent: string;
    }>;
  };
  /** Phase 3: Follow-up work */
  phase3: {
    followUpText: string;
    finalEdit: {
      path: string;
      beforeContent: string;
      afterContent: string;
    };
    completionText: string;
  };
  /** Enable looping */
  loop?: boolean;
}

/**
 * Complex Refactoring Scenario Decorator
 *
 * Simulates: User asks → Think → Read files → Multi-edit → Follow-up text → Final edit → Complete
 *
 * Timeline:
 * 1. User message appears
 * 2. Agent starts thinking (phase 1)
 * 3. Agent reads multiple files
 * 4. Agent streams intermediate text
 * 5. Agent performs initial edits (phase 2)
 * 6. Agent streams follow-up text (phase 3)
 * 7. Agent performs final edit
 * 8. Agent streams completion text
 *
 * Usage:
 * ```tsx
 * export const ComplexRefactor: Story = {
 *   decorators: [withComplexRefactoringScenario],
 *   parameters: {
 *     complexRefactoringScenario: {
 *       userMessage: 'Refactor the authentication system',
 *       phase1: {
 *         thinkingText: 'Let me analyze the authentication code...',
 *         filesToRead: [
 *           { path: 'auth/login.ts', content: '...' },
 *           { path: 'auth/register.ts', content: '...' },
 *         ],
 *       },
 *       phase2: {
 *         intermediateText: 'I found several issues. Let me fix them.',
 *         initialEdits: [
 *           { path: 'auth/login.ts', beforeContent: '...', afterContent: '...' },
 *           { path: 'auth/register.ts', beforeContent: '...', afterContent: '...' },
 *         ],
 *       },
 *       phase3: {
 *         followUpText: 'Now I need to update the types file.',
 *         finalEdit: { path: 'auth/types.ts', beforeContent: '...', afterContent: '...' },
 *         completionText: 'All authentication files have been refactored.',
 *       },
 *     }
 *   }
 * };
 * ```
 */
export const withComplexRefactoringScenario: Decorator = (Story, context) => {
  const config = context.parameters.complexRefactoringScenario as
    | ComplexRefactoringScenarioConfig
    | undefined;
  const baseMockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  if (!config) {
    return <Story />;
  }

  return (
    <ComplexRefactoringScenarioSimulator
      config={config}
      baseMockState={baseMockState}
    >
      <Story />
    </ComplexRefactoringScenarioSimulator>
  );
};

interface ComplexRefactoringScenarioSimulatorProps {
  config: ComplexRefactoringScenarioConfig;
  baseMockState?: Partial<AppState>;
  children: React.ReactNode;
}

function ComplexRefactoringScenarioSimulator({
  config,
  baseMockState,
  children,
}: ComplexRefactoringScenarioSimulatorProps) {
  const [currentState, setCurrentState] = useState<Partial<AppState>>(
    baseMockState || {},
  );
  const [executor, setExecutor] = useState<TimelineExecutor | null>(null);

  useEffect(() => {
    const timeline = buildComplexRefactoringTimeline(config);
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
          const timeline = buildComplexRefactoringTimeline(config);
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
 * Build timeline for complex refactoring scenario
 */
function buildComplexRefactoringTimeline(
  config: ComplexRefactoringScenarioConfig,
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

  // 4. Stream reasoning (Phase 1)
  timeline.push({
    type: 'stream-reasoning-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: partIndex++,
    fullText: config.phase1.thinkingText,
    chunkStrategy: 'word',
    intervalMs: REALISTIC_TIMING.textStreaming.intervalMs,
    duration: thinkingDuration,
  });

  currentTime += thinkingDuration;

  // 5. Read files in parallel (Phase 1)
  currentTime += 200;
  const readStartTime = currentTime;
  const readToolIds: string[] = [];

  config.phase1.filesToRead.forEach((file, index) => {
    const toolId = `read-file-tool-${index + 1}`;
    readToolIds.push(toolId);
    const pIndex = partIndex++;

    // Add read tool
    timeline.push({
      type: 'update-message-part',
      timestamp: readStartTime,
      messageId: assistantMessageId,
      partIndex: pIndex,
      updater: () =>
        createReadFileToolPart(file.path, '', 'input-streaming', {
          toolCallId: toolId,
        }),
    });
  });

  // Transition to input-available
  currentTime = readStartTime + REALISTIC_TIMING.phaseTransition;
  readToolIds.forEach((toolId) => {
    timeline.push({
      type: 'update-tool-state',
      timestamp: currentTime,
      messageId: assistantMessageId,
      toolCallId: toolId,
      newState: 'input-available',
    });
  });

  // Complete reads (output-available)
  currentTime += getRandomDuration(
    REALISTIC_TIMING.fileOperation.min,
    REALISTIC_TIMING.fileOperation.max,
  );
  config.phase1.filesToRead.forEach((file, index) => {
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

  // 6. Intermediate text (Phase 2)
  currentTime += config.phase1.filesToRead.length * 250 + 300;
  const intermediateTextPartIndex = partIndex++;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: intermediateTextPartIndex,
    updater: () => createTextPart('', 'streaming'),
  });

  const intermediateStreamDuration = Math.ceil(
    config.phase2.intermediateText.split(' ').length *
      REALISTIC_TIMING.textStreaming.intervalMs,
  );

  timeline.push({
    type: 'stream-text-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: intermediateTextPartIndex,
    fullText: config.phase2.intermediateText,
    chunkStrategy: 'word',
    intervalMs: REALISTIC_TIMING.textStreaming.intervalMs,
    duration: intermediateStreamDuration,
  });

  // 7. Initial edits (Phase 2)
  currentTime += intermediateStreamDuration + 400;
  const editStartTime = currentTime;
  const editToolIds: string[] = [];

  config.phase2.initialEdits.forEach((edit, index) => {
    const toolId = `multi-edit-tool-${index + 1}`;
    editToolIds.push(toolId);
    const pIndex = partIndex++;

    // Add edit tool
    timeline.push({
      type: 'update-message-part',
      timestamp: editStartTime,
      messageId: assistantMessageId,
      partIndex: pIndex,
      updater: () =>
        createMultiEditToolPart(edit.path, '', 'input-streaming', {
          toolCallId: toolId,
          oldContent: edit.beforeContent,
        }),
    });

    // Stream content
    const contentStreamDuration = Math.ceil(edit.afterContent.length * 10);
    timeline.push({
      type: 'stream-tool-input-field',
      timestamp: editStartTime,
      messageId: assistantMessageId,
      toolCallId: toolId,
      fieldPath: 'input.edits.0.new_string',
      targetContent: edit.afterContent,
      chunkStrategy: 'char',
      intervalMs: REALISTIC_TIMING.toolInputStreaming.intervalMs,
      duration: contentStreamDuration,
    });
  });

  // Calculate max streaming duration
  const maxEditStreamDuration = Math.max(
    ...config.phase2.initialEdits.map((e) =>
      Math.ceil(e.afterContent.length * 10),
    ),
  );

  // Transition to input-available
  currentTime =
    editStartTime + maxEditStreamDuration + REALISTIC_TIMING.phaseTransition;
  config.phase2.initialEdits.forEach((edit, index) => {
    timeline.push({
      type: 'update-tool-state',
      timestamp: currentTime + index * 200,
      messageId: assistantMessageId,
      toolCallId: editToolIds[index]!,
      newState: 'input-available',
      input: {
        relative_path: edit.path,
        edits: [
          {
            old_string: edit.beforeContent,
            new_string: edit.afterContent,
          },
        ],
      },
    });
  });

  // Complete edits (output-available)
  currentTime += config.phase2.initialEdits.length * 200 + 200;
  config.phase2.initialEdits.forEach((edit, index) => {
    timeline.push({
      type: 'update-tool-state',
      timestamp: currentTime + index * 300,
      messageId: assistantMessageId,
      toolCallId: editToolIds[index]!,
      newState: 'output-available',
      output: {
        message: 'File edited successfully',
        result: {
          editsApplied: 1,
        },
        hiddenFromLLM: {
          diff: {
            path: edit.path,
            before: edit.beforeContent,
            after: edit.afterContent,
          },
        },
      },
    });
  });

  // 8. Follow-up text (Phase 3)
  currentTime += config.phase2.initialEdits.length * 300 + 300;
  const followUpTextPartIndex = partIndex++;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: followUpTextPartIndex,
    updater: () => createTextPart('', 'streaming'),
  });

  const followUpStreamDuration = Math.ceil(
    config.phase3.followUpText.split(' ').length *
      REALISTIC_TIMING.textStreaming.intervalMs,
  );

  timeline.push({
    type: 'stream-text-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: followUpTextPartIndex,
    fullText: config.phase3.followUpText,
    chunkStrategy: 'word',
    intervalMs: REALISTIC_TIMING.textStreaming.intervalMs,
    duration: followUpStreamDuration,
  });

  // 9. Final edit (Phase 3)
  currentTime += followUpStreamDuration + 400;
  const finalToolId = 'final-multi-edit-tool';
  const finalEditPartIndex = partIndex++;
  const finalEdit = config.phase3.finalEdit;

  // Add final edit tool
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: finalEditPartIndex,
    updater: () =>
      createMultiEditToolPart(finalEdit.path, '', 'input-streaming', {
        toolCallId: finalToolId,
        oldContent: finalEdit.beforeContent,
      }),
  });

  // Stream final content
  const finalContentStreamDuration = Math.ceil(
    finalEdit.afterContent.length * 10,
  );
  timeline.push({
    type: 'stream-tool-input-field',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId: finalToolId,
    fieldPath: 'input.edits.0.new_string',
    targetContent: finalEdit.afterContent,
    chunkStrategy: 'char',
    intervalMs: REALISTIC_TIMING.toolInputStreaming.intervalMs,
    duration: finalContentStreamDuration,
  });

  // Transition to input-available
  currentTime += finalContentStreamDuration + REALISTIC_TIMING.phaseTransition;
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId: finalToolId,
    newState: 'input-available',
    input: {
      relative_path: finalEdit.path,
      edits: [
        {
          old_string: finalEdit.beforeContent,
          new_string: finalEdit.afterContent,
        },
      ],
    },
  });

  // Complete final edit
  currentTime += getRandomDuration(
    REALISTIC_TIMING.fileOperation.min,
    REALISTIC_TIMING.fileOperation.max,
  );
  timeline.push({
    type: 'update-tool-state',
    timestamp: currentTime,
    messageId: assistantMessageId,
    toolCallId: finalToolId,
    newState: 'output-available',
    output: {
      message: 'File edited successfully',
      result: {
        editsApplied: 1,
      },
      hiddenFromLLM: {
        diff: {
          path: finalEdit.path,
          before: finalEdit.beforeContent,
          after: finalEdit.afterContent,
        },
      },
      nonSerializableMetadata: {
        undoExecute: null,
      },
    },
  });

  // 10. Completion text (Phase 3)
  currentTime += 300;
  const completionTextPartIndex = partIndex++;
  timeline.push({
    type: 'update-message-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: completionTextPartIndex,
    updater: () => createTextPart('', 'streaming'),
  });

  const completionStreamDuration = Math.ceil(
    config.phase3.completionText.split(' ').length *
      REALISTIC_TIMING.textStreaming.intervalMs,
  );

  timeline.push({
    type: 'stream-text-part',
    timestamp: currentTime,
    messageId: assistantMessageId,
    partIndex: completionTextPartIndex,
    fullText: config.phase3.completionText,
    chunkStrategy: 'word',
    intervalMs: REALISTIC_TIMING.textStreaming.intervalMs,
    duration: completionStreamDuration,
  });

  // 11. Set isWorking to false
  currentTime += completionStreamDuration + 100;
  timeline.push({
    type: 'set-is-working',
    timestamp: currentTime,
    isWorking: false,
  });

  return timeline;
}
