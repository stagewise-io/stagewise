import type { Decorator } from '@storybook/react';
import { useEffect, useState, useMemo } from 'react';
import { MockKartonProvider } from '../mocks/mock-hooks';
import type {
  AppState,
  ChatMessage,
  TextUIPart,
} from '@stagewise/karton-contract';
import type { StreamingConfig } from '../mocks/streaming-configs';

/**
 * Storybook decorator that simulates streaming assistant responses.
 *
 * The decorator progressively updates message content over time, simulating
 * how messages are received from the AI SDK in production. It supports:
 * - Text streaming (character-by-character, word-by-word, or sentence-by-sentence)
 * - Looping (restart after completion)
 * - Configurable timing and chunking strategies
 *
 * Usage:
 * ```tsx
 * export default {
 *   decorators: [withStreamingMessage, withMockKarton],
 *   parameters: {
 *     streamingConfig: {
 *       messageId: 'msg-123',
 *       fullContent: 'Complete message text...',
 *       chunkStrategy: 'word', // 'char' | 'word' | 'sentence'
 *       intervalMs: 50,
 *       loop: true,
 *     }
 *   }
 * }
 * ```
 */
export const withStreamingMessage: Decorator = (Story, context) => {
  const streamingConfig = context.parameters.streamingConfig as
    | StreamingConfig
    | undefined;
  const baseMockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  // If no streaming config, just render normally
  if (!streamingConfig) {
    return <Story />;
  }

  return (
    <StreamingSimulator config={streamingConfig} baseMockState={baseMockState}>
      <Story />
    </StreamingSimulator>
  );
};

interface StreamingSimulatorProps {
  config: StreamingConfig;
  baseMockState?: Partial<AppState>;
  children: React.ReactNode;
}

function StreamingSimulator({
  config,
  baseMockState,
  children,
}: StreamingSimulatorProps) {
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isWorking, setIsWorking] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  // Split content into chunks based on strategy
  const chunks = useMemo(() => {
    return splitIntoChunks(config.fullContent, config.chunkStrategy || 'word');
  }, [config.fullContent, config.chunkStrategy]);

  // Calculate current text content
  const currentText = useMemo(() => {
    return chunks.slice(0, currentChunkIndex + 1).join('');
  }, [chunks, currentChunkIndex]);

  // Determine if streaming is complete
  const isComplete = currentChunkIndex >= chunks.length - 1;

  // Streaming animation effect
  useEffect(() => {
    if (isPaused) return;

    if (isComplete) {
      if (!config.loop) {
        setIsWorking(false);
        return;
      }

      // Loop: pause briefly, then restart
      setIsPaused(true);
      setIsWorking(false);

      const restartTimer = setTimeout(() => {
        setCurrentChunkIndex(0);
        setIsWorking(true);
        setIsPaused(false);
      }, 1000); // 1 second pause before restarting

      return () => clearTimeout(restartTimer);
    }

    const timer = setTimeout(() => {
      setCurrentChunkIndex((prev) => prev + 1);
    }, config.intervalMs || 50);

    return () => clearTimeout(timer);
  }, [
    currentChunkIndex,
    chunks.length,
    config.loop,
    config.intervalMs,
    isComplete,
    isPaused,
  ]);

  // Build the streaming message state
  const streamingState = useMemo(() => {
    const chatId =
      baseMockState?.workspace?.agentChat?.activeChatId || 'streaming-chat';
    const existingChat = baseMockState?.workspace?.agentChat?.chats?.[chatId];

    // Find and update the target message
    const updatedMessages = (existingChat?.messages || []).map((msg) => {
      if (msg.id !== config.messageId) return msg;

      // Update text parts
      const updatedParts = msg.parts.map((part) => {
        if (part.type === 'text') {
          return {
            ...part,
            text: currentText,
            state: isComplete ? undefined : ('streaming' as const),
          } as TextUIPart;
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
        agentChat: {
          ...baseMockState?.workspace?.agentChat,
          chats: {
            ...baseMockState?.workspace?.agentChat?.chats,
            [chatId]: {
              ...existingChat,
              messages: updatedMessages,
            },
          },
          isWorking,
        },
      },
    } as Partial<AppState>;
  }, [baseMockState, config.messageId, currentText, isComplete, isWorking]);

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
  strategy: 'char' | 'word' | 'sentence',
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

    case 'sentence':
      // Split by sentence boundaries but keep punctuation
      return text.split(/(?<=[.!?])\s+/);

    default:
      return [text];
  }
}
