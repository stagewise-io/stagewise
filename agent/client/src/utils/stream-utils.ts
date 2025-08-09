import type { AgentServer } from '@stagewise/agent-interface-internal/agent';
import { ErrorDescriptions, formatErrorDescription } from './error-utils.js';
import type { TextStreamPart, Tool } from 'ai';

/**
 * Creates a timeout promise that rejects after the specified duration
 */
export function createTimeoutPromise(
  timeout: number,
  errorMessage?: string,
): Promise<never> {
  return new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(errorMessage || `Timeout after ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Consumes the agent stream and updates the UI with text deltas
 */
export async function consumeAgentStream(
  fullStream: AsyncIterable<TextStreamPart<Record<string, Tool>>>,
  server: AgentServer,
  chatId: string,
  onError?: (error: unknown) => void,
) {
  let messageId: string | undefined = crypto.randomUUID(); // the crypto id won't be used, it's a fallback (step-start should always override it)
  try {
    let partIndex = 0;
    for await (const chunk of fullStream) {
      if (chunk.type === 'step-start') {
        messageId = chunk.messageId;
        server.interface.chat.addMessage(
          {
            id: messageId,
            content: [
              {
                type: 'text',
                text: '',
              },
            ],
            role: 'assistant',
            createdAt: new Date(),
          },
          chatId,
        );
      }
      if (chunk.type === 'text-delta' && chunk.textDelta) {
        server.interface.chat.streamMessagePart(
          messageId,
          partIndex,
          {
            messageId,
            content: {
              type: 'text',
              text: chunk.textDelta,
            },
            partIndex,
            updateType: 'append',
          },
          chatId,
        );
      }
      if (chunk.type === 'tool-call') {
        server.interface.chat.streamMessagePart(
          messageId,
          partIndex,
          {
            messageId,
            partIndex,
            content: {
              type: 'tool-call',
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              input: chunk.args,
              runtime: 'cli',
              requiresApproval: false,
            },
            updateType: 'create',
          },
          chatId,
        );
        partIndex++;
      }
    }
    return { messageId };
  } catch (streamError) {
    console.error('[Agent]: Error consuming stream:', streamError);
    if (onError) {
      onError(streamError);
    }
    throw streamError;
  }
}

/**
 * Races a promise against a timeout, returning whichever resolves first
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeout: number,
  timeoutMessage?: string,
): Promise<T> {
  return Promise.race([promise, createTimeoutPromise(timeout, timeoutMessage)]);
}

/**
 * Manages timeout cleanup with proper cancellation
 */
export class TimeoutManager {
  private timeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Sets a timeout with a specific key
   */
  set(key: string, callback: () => void, duration: number): void {
    // Clear existing timeout if any
    this.clear(key);

    const timeout = setTimeout(callback, duration);
    this.timeouts.set(key, timeout);
  }

  /**
   * Clears a specific timeout
   */
  clear(key: string): void {
    const timeout = this.timeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(key);
    }
  }

  /**
   * Clears all timeouts
   */
  clearAll(): void {
    this.timeouts.forEach((timeout) => clearTimeout(timeout));
    this.timeouts.clear();
  }

  /**
   * Checks if a timeout exists
   */
  has(key: string): boolean {
    return this.timeouts.has(key);
  }
}

/**
 * Consumes stream with timeout protection
 */
export async function consumeStreamWithTimeout(
  chatId: string,
  fullStream: AsyncIterable<TextStreamPart<Record<string, Tool>>>,
  server: AgentServer,
  timeout: number,
  setWorkingState: (state: boolean, description?: string) => void,
) {
  const streamPromise = consumeAgentStream(
    fullStream,
    server,
    chatId,
    (error) => {
      const errorDesc = formatErrorDescription(
        'Stream processing error',
        error,
        {
          operation: 'consumeAgentStream',
        },
      );
      setWorkingState(false, errorDesc);
    },
  );

  try {
    return await withTimeout(
      streamPromise,
      timeout,
      `Stream timeout after ${timeout}ms`,
    );
  } catch (error) {
    const errorDesc = ErrorDescriptions.streamTimeout(
      timeout,
      'consumeStreamWithTimeout',
    );
    console.error('[Agent]:', errorDesc);
    setWorkingState(false, errorDesc);
    throw error;
  }
}
