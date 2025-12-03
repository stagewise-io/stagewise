import type { Decorator } from '@storybook/react';
import { useEffect, useState, useMemo } from 'react';
import { MockKartonProvider } from '../mocks/mock-hooks';
import type {
  AppState,
  ChatMessage,
  ToolPart,
} from '@shared/karton-contracts/ui';

export interface ToolStreamingPhase {
  /** Duration in milliseconds */
  duration: number;
  /** Tool state for this phase */
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error';
  /** Optional: Configuration for progressive content streaming within this phase */
  streamingConfig?: {
    /** Nested field path to stream (e.g., 'input.content', 'input.relative_path') */
    field: string;
    /** Target content to progressively stream to */
    targetContent: string;
    /** How to chunk the content */
    chunkStrategy?: 'char' | 'word' | 'line';
    /** Milliseconds between chunks */
    intervalMs?: number;
  };
  /** Optional: partial input to show during input-streaming */
  partialInput?: any;
  /** Optional: complete input when transitioning to input-available */
  completeInput?: any;
  /** Optional: output data when reaching output-available */
  output?: any;
  /** Optional: error text when reaching output-error */
  errorText?: string;
}

export interface ToolStreamingConfig {
  /** ID of the message containing the tool */
  messageId: string;
  /** ID of the tool call to animate */
  toolCallId: string;
  /** Phases to animate through */
  phases: ToolStreamingPhase[];
  /** Whether to loop the animation */
  loop?: boolean;
}

/**
 * Storybook decorator that simulates tool call streaming through multiple states.
 *
 * Simulates the full lifecycle:
 * 1. input-streaming: Tool input is being generated (with progressive content streaming)
 * 2. input-available: Tool input is complete, waiting for execution
 * 3. output-available: Tool has been executed and output is available
 *
 * Usage:
 * ```tsx
 * export default {
 *   decorators: [withToolStreaming, withMockKarton],
 *   parameters: {
 *     toolStreamingConfig: {
 *       messageId: 'msg-123',
 *       toolCallId: 'tool-call-456',
 *       phases: [
 *         {
 *           duration: 2000,
 *           state: 'input-streaming',
 *           streamingConfig: {
 *             field: 'input.content',
 *             targetContent: 'export const Button...',
 *             chunkStrategy: 'char',
 *             intervalMs: 30,
 *           },
 *           partialInput: {...}
 *         },
 *         { duration: 500, state: 'input-available', completeInput: {...} },
 *         { duration: 2000, state: 'output-available', output: {...} },
 *       ],
 *       loop: true,
 *     }
 *   }
 * }
 * ```
 */
export const withToolStreaming: Decorator = (Story, context) => {
  const toolStreamingConfig = context.parameters.toolStreamingConfig as
    | ToolStreamingConfig
    | undefined;
  const baseMockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  // If no tool streaming config, just render normally
  if (!toolStreamingConfig) {
    return <Story />;
  }

  return (
    <ToolStreamingSimulator
      config={toolStreamingConfig}
      baseMockState={baseMockState}
    >
      <Story />
    </ToolStreamingSimulator>
  );
};

interface ToolStreamingSimulatorProps {
  config: ToolStreamingConfig;
  baseMockState?: Partial<AppState>;
  children: React.ReactNode;
}

function ToolStreamingSimulator({
  config,
  baseMockState,
  children,
}: ToolStreamingSimulatorProps) {
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [isWorking, setIsWorking] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [streamingChunkIndex, setStreamingChunkIndex] = useState(0);

  const currentPhase = config.phases[currentPhaseIndex];
  const isComplete = currentPhaseIndex >= config.phases.length - 1;

  // Split streaming content into chunks
  const streamingChunks = useMemo(() => {
    if (!currentPhase?.streamingConfig) return [];

    const { targetContent, chunkStrategy = 'char' } =
      currentPhase.streamingConfig;
    return splitIntoChunks(targetContent, chunkStrategy);
  }, [currentPhase?.streamingConfig]);

  // Get current streaming content
  const currentStreamingContent = useMemo(() => {
    if (!currentPhase?.streamingConfig || streamingChunks.length === 0) {
      return null;
    }

    return streamingChunks.slice(0, streamingChunkIndex + 1).join('');
  }, [currentPhase?.streamingConfig, streamingChunks, streamingChunkIndex]);

  // Reset streaming when phase changes
  useEffect(() => {
    setStreamingChunkIndex(0);
  }, [currentPhaseIndex]);

  // Progressive streaming within current phase
  useEffect(() => {
    if (!currentPhase?.streamingConfig || isPaused) return;

    const isStreamingComplete =
      streamingChunkIndex >= streamingChunks.length - 1;
    if (isStreamingComplete) return;

    const timer = setTimeout(() => {
      setStreamingChunkIndex((prev) => prev + 1);
    }, currentPhase.streamingConfig.intervalMs || 30);

    return () => clearTimeout(timer);
  }, [
    currentPhase?.streamingConfig,
    streamingChunkIndex,
    streamingChunks.length,
    isPaused,
  ]);

  // Phase transition effect
  useEffect(() => {
    if (isPaused || !currentPhase) return;

    if (isComplete) {
      if (!config.loop) {
        setIsWorking(false);
        return;
      }

      // Loop: pause briefly, then restart
      setIsPaused(true);
      setIsWorking(false);

      const restartTimer = setTimeout(() => {
        setCurrentPhaseIndex(0);
        setStreamingChunkIndex(0);
        setIsWorking(true);
        setIsPaused(false);
      }, 1500); // 1.5 second pause before restarting

      return () => clearTimeout(restartTimer);
    }

    // Transition to next phase after duration
    const timer = setTimeout(() => {
      setCurrentPhaseIndex((prev) => prev + 1);
    }, currentPhase.duration);

    return () => clearTimeout(timer);
  }, [
    currentPhaseIndex,
    config.loop,
    config.phases.length,
    isComplete,
    isPaused,
    currentPhase,
  ]);

  // Build the tool streaming state
  const streamingState = useMemo(() => {
    const chatId = baseMockState?.agentChat?.activeChatId || 'streaming-chat';
    const existingChat = baseMockState?.agentChat?.chats?.[chatId];

    // Find and update the target message
    const updatedMessages = (existingChat?.messages || []).map((msg) => {
      if (msg.id !== config.messageId) return msg;

      // Update tool parts
      const updatedParts = msg.parts.map((part) => {
        if (
          part.type.startsWith('tool-') &&
          'toolCallId' in part &&
          part.toolCallId === config.toolCallId
        ) {
          const toolPart = part as ToolPart;

          // Build updated tool part based on current phase
          const updatedToolPart: ToolPart = {
            ...toolPart,
            state: currentPhase?.state,
          } as ToolPart;

          // Add phase-specific data
          if (currentPhase?.state === 'input-streaming') {
            let inputData = currentPhase.partialInput || toolPart.input;

            // Apply progressive streaming to nested field if configured
            if (
              currentPhase.streamingConfig &&
              currentStreamingContent !== null
            ) {
              inputData = setNestedField(
                inputData,
                currentPhase.streamingConfig.field,
                currentStreamingContent,
              );
            }

            updatedToolPart.input = inputData;
          } else if (currentPhase?.state === 'input-available') {
            updatedToolPart.input =
              currentPhase.completeInput || toolPart.input;
          } else if (currentPhase?.state === 'output-available') {
            updatedToolPart.input =
              currentPhase.completeInput || toolPart.input;
            (updatedToolPart as any).output = currentPhase.output;
          } else if (currentPhase?.state === 'output-error') {
            updatedToolPart.input =
              currentPhase.completeInput || toolPart.input;
            (updatedToolPart as any).errorText = currentPhase.errorText;
          }

          return updatedToolPart;
        }
        return part;
      });

      return {
        ...msg,
        parts: updatedParts,
      } as ChatMessage;
    });

    return {
      ...baseMockState,
      workspace: {
        ...baseMockState?.workspace,
      },
      agentChat: {
        ...baseMockState?.agentChat,
        chats: {
          ...baseMockState?.agentChat?.chats,
          [chatId]: {
            ...existingChat,
            messages: updatedMessages,
          },
        },
        isWorking,
      },
    } as Partial<AppState>;
  }, [
    baseMockState,
    config.messageId,
    config.toolCallId,
    currentPhase,
    currentStreamingContent,
    isWorking,
  ]);

  return (
    <MockKartonProvider mockState={streamingState}>
      {children}
    </MockKartonProvider>
  );
}

/**
 * Split text into chunks based on the specified strategy
 */
function splitIntoChunks(
  text: string,
  strategy: 'char' | 'word' | 'line',
): string[] {
  switch (strategy) {
    case 'char':
      return text.split('');

    case 'word': {
      // Split by spaces but keep the spaces
      const words: string[] = [];
      let currentWord = '';
      for (const char of text) {
        currentWord += char;
        if (char === ' ' || char === '\n') {
          words.push(currentWord);
          currentWord = '';
        }
      }
      if (currentWord) words.push(currentWord);
      return words;
    }

    case 'line':
      // Split by newlines but keep them
      return text
        .split('\n')
        .flatMap((line, i, arr) =>
          i < arr.length - 1 ? [line, '\n'] : [line],
        );

    default:
      return [text];
  }
}

/**
 * Set a nested field value in an object using dot notation
 * e.g., setNestedField({input: {content: 'old'}}, 'input.content', 'new')
 */
function setNestedField(obj: any, path: string, value: any): any {
  const keys = path.split('.');
  const result = { ...obj };

  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    current[key] = { ...current[key] };
    current = current[key];
  }

  current[keys[keys.length - 1]!] = value;
  return result;
}
