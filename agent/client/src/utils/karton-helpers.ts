import type { ChatMessage } from '@stagewise/karton-contract';
import type { ToolCallProcessingResult } from './tool-call-utils.js';
import type { InferUIMessageChunk, ToolUIPart } from 'ai';
import type { AgentCallbacks } from '../types/agent-callbacks.js';

/**
 * Checks if a message with the given ID exists in the active chat
 * @param callbacks - The agent callbacks for state access
 * @param messageId - The unique identifier of the message to check
 * @returns True if the message exists in the active chat, false otherwise
 */
function messageExists(callbacks: AgentCallbacks, messageId: string): boolean {
  const state = callbacks.getState();
  return state.chats[state.activeChatId!]!.messages.some(
    (m: ChatMessage) => m.id === messageId,
  );
}

/**
 * Creates a new chat with a timestamped title and sets it as the active chat
 * @param callbacks - The agent callbacks for state modification
 * @returns The unique ID of the newly created chat
 */
export function createAndActivateNewChat(callbacks: AgentCallbacks) {
  const chatId = crypto.randomUUID();
  const title = `New Chat - ${new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })}`;
  callbacks.setState((draft) => {
    draft.chats[chatId] = {
      title,
      createdAt: new Date(),
      messages: [],
    };
    draft.activeChatId = chatId;
  });
  return chatId;
}

/**
 * Appends text content to a message, creating the message if it doesn't exist
 * or creating/appending to a text part at the specified index
 * @param callbacks - The agent callbacks for state modification
 * @param messageId - The unique identifier of the message to append to
 * @param delta - The text content to append
 * @param partIndex - The index of the message part to append to
 */
export function appendTextDeltaToMessage(
  callbacks: AgentCallbacks,
  messageId: string,
  delta: string,
  partIndex: number,
) {
  // If the message doesn't exist, create it
  if (!messageExists(callbacks, messageId)) {
    callbacks.setState((draft) => {
      const state = callbacks.getState();
      draft.chats[state.activeChatId!]!.messages.push({
        role: 'assistant',
        id: messageId,
        parts: [{ type: 'text', text: delta }],
        metadata: {
          createdAt: new Date(),
        },
      });
    });
  } else {
    // If the message exists, create a text part or append to the existing one
    callbacks.setState((draft) => {
      const state = callbacks.getState();
      const message = draft.chats[state.activeChatId!]!.messages.find(
        (m: ChatMessage) => m.id === messageId,
      )!;

      // Create a new part if it's a new one
      if (message.parts.length <= partIndex) {
        message.parts.push({ type: 'text', text: delta });
        return;
      }

      const textPart = message.parts[partIndex];
      if (!textPart || textPart.type !== 'text') {
        return;
      }

      // If the text part exists, append the delta to it
      textPart.text += delta;
    });
  }
}

/**
 * Appends tool input information to a message, creating the message if it doesn't exist
 * or updating the tool part at the specified index
 * @param callbacks - The agent callbacks for state modification
 * @param messageId - The unique identifier of the message to append to
 * @param chunk - The tool input chunk containing tool call details
 * @param partIndex - The index of the message part to update
 */
export function appendToolInputToMessage(
  callbacks: AgentCallbacks,
  messageId: string,
  chunk: Extract<
    InferUIMessageChunk<ChatMessage>,
    { type: 'tool-input-available' }
  >,
  partIndex: number,
) {
  callbacks.setState((draft) => {
    const state = callbacks.getState();
    const message = draft.chats[state.activeChatId!]!.messages.find(
      (m: ChatMessage) => m.id === messageId,
    );

    if (!message) {
      // If the message doesn't exist, create it
      draft.chats[state.activeChatId!]!.messages.push({
        role: 'assistant',
        id: messageId,
        parts: [
          {
            type: `tool-${chunk.toolName}` as any,
            state: 'input-available',
            input: chunk.input,
            toolCallId: chunk.toolCallId,
          } satisfies ToolUIPart,
        ],
        metadata: {
          createdAt: new Date(),
        },
      });
    } else if (partIndex >= message.parts.length) {
      // If the current part index is greater than the number of parts, create a new one
      message.parts.push({
        type: `tool-${chunk.toolName}` as any,
        toolCallId: chunk.toolCallId,
        state: 'input-available',
        input: chunk.input,
      } satisfies ToolUIPart);
    } else {
      // If the message has parts, append to the existing one
      const part = message.parts[partIndex];
      if (!part) return; // this should never happen

      if (
        part.type === 'dynamic-tool' ||
        part.type === `tool-${chunk.toolName}`
      ) {
        (part as ToolUIPart).state = 'input-available';
        (part as ToolUIPart).input = chunk.input;
      }
    }
  });
}

/**
 * Attaches tool execution results to the corresponding tool parts in a message
 * Updates the tool part state to reflect success or error outcomes
 * @param callbacks - The agent callbacks for state modification
 * @param toolResults - Array of tool execution results to attach
 * @param messageId - The unique identifier of the message containing the tool parts
 */
export function attachToolOutputToMessage(
  callbacks: AgentCallbacks,
  toolResults: ToolCallProcessingResult[],
  messageId: string,
) {
  callbacks.setState((draft) => {
    const state = callbacks.getState();
    const message = draft.chats[state.activeChatId!]!.messages.find(
      (m: ChatMessage) => m.id === messageId,
    );
    if (!message) return;
    for (const result of toolResults) {
      const part = message.parts.find(
        (p: any) => 'toolCallId' in p && p.toolCallId === result.toolCallId,
      );
      if (!part) continue;
      if (part.type !== 'dynamic-tool' && !part.type.startsWith('tool-'))
        continue;

      const toolPart = part as ToolUIPart;

      if (result.success) {
        toolPart.state = 'output-available';
        toolPart.output = result.result;
      } else {
        toolPart.state = 'output-error';
        toolPart.errorText = result.error?.message;
      }
    }
  });
}

/**
 * Finds tool calls in the last assistant message that don't have corresponding results
 * @param callbacks - The agent callbacks for state access
 * @param chatId - The chat ID to check
 * @returns Array of pending tool call IDs and their names
 */
export function findPendingToolCalls(
  callbacks: AgentCallbacks,
  chatId: string,
): Array<{ toolCallId: string }> {
  const state = callbacks.getState();
  const chat = state.chats[chatId];
  if (!chat) return [];

  const messages = chat.messages;

  // Find the last assistant message
  let lastAssistantMessage = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && message.role === 'assistant') {
      lastAssistantMessage = message;
      break;
    }
  }

  if (!lastAssistantMessage) return [];

  const pendingToolCalls: Array<{ toolCallId: string }> = [];

  // Check each part of the assistant message
  for (const part of lastAssistantMessage.parts) {
    if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
      const toolPart = part as ToolUIPart;

      // Only consider tool calls with 'input-available' state as pending
      // Other states like 'output-available' or 'output-error' are terminal
      if (toolPart.state === 'input-available' && 'toolCallId' in part) {
        pendingToolCalls.push({
          toolCallId: toolPart.toolCallId,
        });
      }
    }
  }

  return pendingToolCalls;
}
