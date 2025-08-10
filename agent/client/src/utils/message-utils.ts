import type { ModelMessage, ToolResultPart } from 'ai';
import type { ChatMessage } from '@stagewise/karton-contract';

/**
 * Converts an array of messages (including UserMessage types) to ModelMessage format
 */
export function messagesToCoreMessages(
  _messages: (ModelMessage | ChatMessage)[],
): ModelMessage[] {
  return [];
  // TODO: fix this
  // return messages.map((m) => {
  //   if (!isUserMessage(m)) {
  //     return m;
  //   }

  //   const content = m.content.map((c) => {
  //     if (c.type === 'text') {
  //       return {
  //         type: 'text' as const,
  //         text: c.text,
  //       };
  //     } else if (c.type === 'file') {
  //       return {
  //         type: 'file' as const,
  //         data: c.data,
  //         mimeType: c.mimeType,
  //       };
  //     }
  //   });
  //   const validContent = content.filter((c) => c !== undefined);

  //   return {
  //     role: 'user',
  //     content: validContent,
  //   };
  // });
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
  _history: (ModelMessage | ChatMessage)[],
): boolean {
  return false;
  // TODO: fix this
  // const lastMessage = history[history.length - 1];

  // if (!lastMessage || isUserMessage(lastMessage)) {
  //   return false;
  // }

  // return (
  //   lastMessage.role === 'tool' &&
  //   Array.isArray(lastMessage.content) &&
  //   lastMessage.content[0]?.type === 'tool-result'
  // );
}

/**
 * Creates a tool result message
 */
export function createToolResultMessage(
  _toolName: string,
  _toolCallId: string,
  _result: any,
): ModelMessage {
  return {
    role: 'tool',
    content: [],
    //TODO: fix this
    // content: [
    //   {
    //     type: 'tool-result',
    //     toolName,
    //     toolCallId,
    //     result,
    //   },
    // ],
  };
}

/**
 * Creates an assistant message with tool call
 */
export function createAssistantToolCallMessage(
  _toolName: string,
  _toolCallId: string,
  _args: any,
): ModelMessage {
  return {
    role: 'assistant',
    content: [],
    //TODO: fix this
    // content: [
    //   {
    //     type: 'tool-call',
    //     toolName,
    //     toolCallId,
    //     args,
    //   },
    // ],
  };
}

/**
 * Creates an assistant message with multiple tool calls
 */
export function createAssistantToolCallsMessage(
  _toolCalls: Array<{
    toolName: string;
    toolCallId: string;
    args: any;
  }>,
): ModelMessage {
  return {
    role: 'assistant',
    content: [],
    //TODO: fix this
    // content: toolCalls.map((tc) => ({
    //   type: 'tool-call',
    //   toolName: tc.toolName,
    //   toolCallId: tc.toolCallId,
    //   args: tc.args,
    // })),
  };
}

/**
 * Creates a tool results message with multiple results
 */
export function createToolResultsMessage(
  _results: ToolResultPart[],
): ModelMessage {
  return {
    role: 'tool',
    content: [],
    //TODO: fix this
    // content: results.map((r) => ({
    //   type: 'tool-result',
    //   toolName: r.toolName,
    //   toolCallId: r.toolCallId,
    //   result: r.result,
    // })),
  };
}
