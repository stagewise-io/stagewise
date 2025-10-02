import type { KartonContract } from '@stagewise/karton-contract';
import type { KartonServer } from '@stagewise/karton/server';
import type { ToolCallProcessingResult } from './tool-call-utils.js';
import type { ToolUIPart } from 'ai';
import { randomUUID } from 'node:crypto';

/**
 * Creates a new chat with a timestamped title and sets it as the active chat
 * @param callbacks - The agent callbacks for state modification
 * @returns The unique ID of the newly created chat
 */
export function createAndActivateNewChat(karton: KartonServer<KartonContract>) {
  const chatId = randomUUID();
  const title = `New Chat - ${new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })}`;
  karton.setState((draft) => {
    draft.workspace!.agentChat!.chats[chatId] = {
      title,
      createdAt: new Date(),
      messages: [],
    };
    draft.workspace!.agentChat!.activeChatId = chatId;
  });
  return chatId;
}

/**
 * Attaches tool execution results to the corresponding tool parts in a message
 * Updates the tool part state to reflect success or error outcomes
 * @param callbacks - The agent callbacks for state modification
 * @param toolResults - Array of tool execution results to attach
 * @param messageId - The unique identifier of the message containing the tool parts
 */
export function attachToolOutputToMessage(
  karton: KartonServer<KartonContract>,
  toolResults: ToolCallProcessingResult[],
  messageId: string,
) {
  karton.setState((draft) => {
    const state = karton.state;
    const message = draft.workspace!.agentChat!.chats[
      state.workspace!.agentChat!.activeChatId!
    ]!.messages.find((m) => m.id === messageId);
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
        toolPart.input = toolPart.input ?? {};
        toolPart.output = result.result;
      } else {
        toolPart.input = toolPart.input ?? {};
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
  karton: KartonServer<KartonContract>,
  chatId: string,
): Array<{ toolCallId: string }> {
  const state = karton.state;
  const chat = state.workspace!.agentChat!.chats[chatId];
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
      if (
        (toolPart.state === 'input-available' ||
          toolPart.state === 'input-streaming') &&
        'toolCallId' in part
      ) {
        pendingToolCalls.push({
          toolCallId: toolPart.toolCallId,
        });
      }
    }
  }

  return pendingToolCalls;
}
