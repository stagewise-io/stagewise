import type { CoreMessage, ToolResultPart } from 'ai';
import type { UserMessage } from '@stagewise/agent-interface-internal/agent';
import { isUserMessage } from '@stagewise/agent-types';

/**
 * Converts an array of messages (including UserMessage types) to CoreMessage format
 */
export function messagesToCoreMessages(
  messages: (CoreMessage | UserMessage)[],
): CoreMessage[] {
  return messages.map((m) => {
    if (!isUserMessage(m)) {
      return m;
    }

    const content = m.contentItems.map((c) => {
      if (c.type === 'text') {
        return {
          type: 'text' as const,
          text: c.text,
        };
      } else {
        return {
          type: 'image' as const,
          image: c.data,
          mimeType: c.mimeType,
        };
      }
    });

    return {
      role: 'user',
      content,
    };
  });
}

/**
 * Extracts tool calls from response messages
 */
export function extractToolCallsFromMessages(
  messages: Array<{
    content: string | Array<{ type: string; [key: string]: any }>;
  }>,
): Array<{
  toolName: string;
  toolCallId: string;
  args: any;
}> {
  const toolCalls: Array<{
    toolName: string;
    toolCallId: string;
    args: any;
  }> = [];

  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const c of message.content) {
        if (c.type === 'tool-call') {
          toolCalls.push({
            toolName: c.toolName,
            toolCallId: c.toolCallId,
            args: c.args,
          });
        }
      }
    }
  }

  return toolCalls;
}

/**
 * Counts tool calls in response messages
 */
export function countToolCalls(
  messages: Array<{
    content: string | Array<{ type: string }>;
  }>,
): { hasToolCalls: boolean; toolCallCount: number } {
  let toolCallCount = 0;
  let hasToolCalls = false;

  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const c of message.content) {
        if (c.type === 'tool-call') {
          toolCallCount++;
          hasToolCalls = true;
        }
      }
    }
  }

  return { hasToolCalls, toolCallCount };
}

/**
 * Checks if the last message in history is a tool result
 */
export function isLastMessageToolResult(
  history: (CoreMessage | UserMessage)[],
): boolean {
  const lastMessage = history[history.length - 1];

  if (!lastMessage || isUserMessage(lastMessage)) {
    return false;
  }

  return (
    lastMessage.role === 'tool' &&
    Array.isArray(lastMessage.content) &&
    lastMessage.content[0]?.type === 'tool-result'
  );
}

/**
 * Creates a tool result message
 */
export function createToolResultMessage(
  toolName: string,
  toolCallId: string,
  result: any,
): CoreMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        result,
        toolName,
        toolCallId,
      },
    ],
  };
}

/**
 * Creates an assistant message with tool call
 */
export function createAssistantToolCallMessage(
  toolName: string,
  toolCallId: string,
  args: any,
): CoreMessage {
  return {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolName,
        toolCallId,
        args,
      },
    ],
  };
}

/**
 * Creates an assistant message with multiple tool calls
 */
export function createAssistantToolCallsMessage(
  toolCalls: Array<{
    toolName: string;
    toolCallId: string;
    args: any;
  }>,
): CoreMessage {
  return {
    role: 'assistant',
    content: toolCalls.map((tc) => ({
      type: 'tool-call',
      toolName: tc.toolName,
      toolCallId: tc.toolCallId,
      args: tc.args,
    })),
  };
}

/**
 * Creates a tool results message with multiple results
 */
export function createToolResultsMessage(
  results: ToolResultPart[],
): CoreMessage {
  return {
    role: 'tool',
    content: results.map((r) => ({
      type: 'tool-result',
      toolName: r.toolName,
      toolCallId: r.toolCallId,
      result: r.result,
    })),
  };
}
