import type { KartonContract, ChatMessage } from '@stagewise/karton-contract';
import type { KartonServer } from '@stagewise/karton/server';
import type { ToolCallProcessingResult } from './tool-call-utils.js';
import type { InferUIMessageChunk } from 'ai';

function messageExists(
  karton: KartonServer<KartonContract>,
  messageId: string,
): boolean {
  return karton.state.chats[karton.state.activeChatId!]!.messages.some(
    (m) => m.id === messageId,
  );
}

export function createAndActivateNewChat(karton: KartonServer<KartonContract>) {
  const chatId = crypto.randomUUID();
  const title = `New Chat - ${new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })}`;
  karton.setState((draft) => {
    draft.chats[chatId] = {
      title,
      createdAt: new Date(),
      messages: [],
    };
    draft.activeChatId = chatId;
  });
  return chatId;
}

export function appendTextDeltaToMessage(
  karton: KartonServer<KartonContract>,
  messageId: string,
  delta: string,
  partIndex: number,
) {
  // If the message doesn't exist, create it
  if (!messageExists(karton, messageId)) {
    karton.setState((draft) => {
      draft.chats[karton.state.activeChatId!]!.messages.push({
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
    karton.setState((draft) => {
      const message = draft.chats[karton.state.activeChatId!]!.messages.find(
        (m) => m.id === messageId,
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

export function appendToolInputToMessage(
  karton: KartonServer<KartonContract>,
  messageId: string,
  chunk: Extract<
    InferUIMessageChunk<ChatMessage>,
    { type: 'tool-input-available' }
  >,
  partIndex: number,
) {
  karton.setState((draft) => {
    const message = draft.chats[karton.state.activeChatId!]!.messages.find(
      (m) => m.id === messageId,
    );
    if (!message) {
      // If the message doesn't exist, create it
      draft.chats[karton.state.activeChatId!]!.messages.push({
        role: 'assistant',
        id: messageId,
        parts: [
          {
            type: `tool-${chunk.toolName}` as any, // reconstruct the type from the tool name
            state: 'input-available',
            input: chunk.input,
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
          },
        ],
        metadata: {
          createdAt: new Date(),
        },
      });
      return;
    }
    if (partIndex >= message.parts.length) {
      // If the current part index is greater than the number of parts, create a new one
      message.parts.push({
        type: `tool-${chunk.toolName}` as any,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        state: 'input-available',
        input: chunk.input,
      });
    } else {
      // If the message has parts, append to the existing one
      const part = message.parts[partIndex];
      if (
        !part ||
        part.type !== 'dynamic-tool' ||
        part.type !== `tool-${chunk.toolName}`
      )
        return;

      part.state = 'input-available';
      part.input = chunk.input;
    }
  });
}

export function attachToolOutputToMessage(
  karton: KartonServer<KartonContract>,
  toolResults: ToolCallProcessingResult[],
  messageId: string,
) {
  karton.setState((draft) => {
    const message = draft.chats[karton.state.activeChatId!]!.messages.find(
      (m) => m.id === messageId,
    );
    if (!message) return;
    for (const result of toolResults) {
      const part = message.parts.find(
        (p) => 'toolCallId' in p && p.toolCallId === result.toolCallId,
      );
      if (!part) continue;
      if (
        part.type !== 'dynamic-tool' &&
        part.type !== 'tool-deleteFileTool' &&
        part.type !== 'tool-overwriteFileTool' &&
        part.type !== 'tool-globTool' &&
        part.type !== 'tool-grepSearchTool' &&
        part.type !== 'tool-listFilesTool' &&
        part.type !== 'tool-multiEditTool' &&
        part.type !== 'tool-readFileTool'
      )
        continue;

      if (result.success) {
        part.state = 'output-available';
        part.output = result.result;
      } else {
        part.state = 'output-error';
        part.errorText = result.error?.message;
      }
    }
  });
}
