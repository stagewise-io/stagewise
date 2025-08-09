/**
 * Chat update handler for processing real-time chat updates
 *
 * This module handles all incoming chat updates from the agent,
 * managing state changes and extracting relevant information like
 * pending tool calls.
 */

import type {
  ChatUpdate,
  AssistantMessage,
  ToolMessage,
} from '@stagewise/agent-interface-internal/toolbar';
import type {
  ChatState,
  MessageStreamingState,
  PendingToolCall,
} from './types';

/**
 * Creates a handler for processing chat updates
 *
 * @param setChatState - State setter for chat state
 * @param setStreamingState - State setter for streaming state
 * @param setPendingToolCalls - State setter for pending tool calls
 * @param processedUpdatesRef - Ref to track processed updates to prevent duplicates
 * @returns A function that handles chat updates
 */
export function createChatUpdateHandler(
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>,
  setStreamingState: React.Dispatch<
    React.SetStateAction<MessageStreamingState>
  >,
  setPendingToolCalls: React.Dispatch<React.SetStateAction<PendingToolCall[]>>,
  processedUpdatesRef: React.MutableRefObject<Set<string>>,
  setIsWorking: React.Dispatch<React.SetStateAction<boolean>>,
) {
  return (update: ChatUpdate) => {
    // Prevent duplicate processing of the same update
    const updateKey = `${update.type}-${JSON.stringify(update)}`;

    if (processedUpdatesRef.current.has(updateKey)) {
      return;
    }

    processedUpdatesRef.current.add(updateKey);

    // Clean up old processed updates to prevent memory leak
    if (processedUpdatesRef.current.size > 200) {
      const entries = Array.from(processedUpdatesRef.current);
      processedUpdatesRef.current = new Set(entries.slice(-100));
    }

    // Handle different update types
    switch (update.type) {
      case 'chat-list':
        handleChatList(update, setChatState);
        break;

      case 'chat-created':
        handleChatCreated(update, setChatState);
        break;

      case 'chat-deleted':
        handleChatDeleted(update, setChatState);
        break;

      case 'chat-switched':
        handleChatSwitched(update, setChatState);
        break;

      case 'chat-full-sync':
        handleChatFullSync(update, setChatState, setPendingToolCalls);
        break;

      case 'message-added':
        handleMessageAdded(update, setChatState, setPendingToolCalls);
        break;

      case 'message-updated':
        handleMessageUpdated(update, setChatState, setStreamingState);
        break;

      case 'chat-title-updated':
        handleChatTitleUpdated(update, setChatState);
        break;

      case 'agent-state':
        handleAgentState(update, setIsWorking);
        break;
    }
  };
}

/**
 * Handles chat list updates
 */
function handleChatList(
  update: Extract<ChatUpdate, { type: 'chat-list' }>,
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>,
) {
  setChatState((prev) => ({
    ...prev,
    chats: update.chats,
    isLoading: false,
  }));
}

/**
 * Handles chat creation
 */
function handleChatCreated(
  update: Extract<ChatUpdate, { type: 'chat-created' }>,
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>,
) {
  setChatState((prev) => ({
    ...prev,
    chats: [
      ...prev.chats,
      {
        id: update.chat.id,
        title: update.chat.title,
        createdAt: update.chat.createdAt,
        isActive: update.chat.isActive,
        messageCount: update.chat.messages.length,
      },
    ],
    activeChat: update.chat.isActive ? update.chat : prev.activeChat,
    isLoading: false,
  }));
}

/**
 * Handles chat deletion
 */
function handleChatDeleted(
  update: Extract<ChatUpdate, { type: 'chat-deleted' }>,
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>,
) {
  setChatState((prev) => ({
    ...prev,
    chats: prev.chats.filter((c) => c.id !== update.chatId),
    activeChat: prev.activeChat?.id === update.chatId ? null : prev.activeChat,
    isLoading: false,
  }));
}

/**
 * Handles chat title updates
 */
function handleChatTitleUpdated(
  update: Extract<ChatUpdate, { type: 'chat-title-updated' }>,
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>,
) {
  setChatState((prev) => ({
    ...prev,
    chats: prev.chats.map((c) =>
      c.id === update.chatId ? { ...c, title: update.title } : c,
    ),
    activeChat:
      prev.activeChat?.id === update.chatId
        ? { ...prev.activeChat, title: update.title }
        : prev.activeChat,
  }));
}

/**
 * Handles chat switching
 */
function handleChatSwitched(
  update: Extract<ChatUpdate, { type: 'chat-switched' }>,
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>,
) {
  setChatState((prev) => ({
    ...prev,
    chats: prev.chats.map((c) => ({
      ...c,
      isActive: c.id === update.chatId,
    })),
    isLoading: false,
  }));
}

/**
 * Handles full chat synchronization
 * Extracts pending tool calls from the synced chat
 */
function handleChatFullSync(
  update: Extract<ChatUpdate, { type: 'chat-full-sync' }>,
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>,
  setPendingToolCalls: React.Dispatch<React.SetStateAction<PendingToolCall[]>>,
) {
  setChatState((prev) => ({
    ...prev,
    activeChat: update.chat,
    chats: prev.chats.map((c) =>
      c.id === update.chat.id
        ? { ...c, isActive: true, messageCount: update.chat.messages.length }
        : { ...c, isActive: false },
    ),
    isLoading: false,
  }));

  // Extract pending tool calls from the synced chat
  const pendingCalls: PendingToolCall[] = [];

  update.chat.messages.forEach((msg) => {
    if (msg.role === 'assistant') {
      const assistantMsg = msg as AssistantMessage;
      assistantMsg.content.forEach((part) => {
        if (part.type === 'tool-call' && part.requiresApproval) {
          // Check if there's no corresponding approval/result yet
          const hasResponse = update.chat.messages.some(
            (m) =>
              m.role === 'tool' &&
              (m as ToolMessage).content.some(
                (r) => r.toolCallId === part.toolCallId,
              ),
          );

          if (!hasResponse) {
            pendingCalls.push({
              chatId: update.chat.id,
              messageId: msg.id,
              toolCall: part,
              timestamp: msg.createdAt,
            });
          }
        }
      });
    }
  });

  setPendingToolCalls(pendingCalls);
}

/**
 * Handles new message additions
 * Checks for new pending tool calls
 */
function handleMessageAdded(
  update: Extract<ChatUpdate, { type: 'message-added' }>,
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>,
  setPendingToolCalls: React.Dispatch<React.SetStateAction<PendingToolCall[]>>,
) {
  setChatState((prev) => {
    if (!prev.activeChat || prev.activeChat.id !== update.chatId) {
      return prev;
    }

    return {
      ...prev,
      activeChat: {
        ...prev.activeChat,
        messages: [...prev.activeChat.messages, update.message],
      },
      chats: prev.chats.map((c) =>
        c.id === update.chatId ? { ...c, messageCount: c.messageCount + 1 } : c,
      ),
    };
  });

  // Check for new pending tool calls
  if (update.message.role === 'assistant') {
    const assistantMsg = update.message as AssistantMessage;
    const newPendingCalls: PendingToolCall[] = [];

    assistantMsg.content.forEach((part) => {
      if (part.type === 'tool-call' && part.requiresApproval) {
        newPendingCalls.push({
          chatId: update.chatId,
          messageId: update.message.id,
          toolCall: part,
          timestamp: update.message.createdAt,
        });
      }
    });

    if (newPendingCalls.length > 0) {
      setPendingToolCalls((prev) => [...prev, ...newPendingCalls]);
    }
  }
}

/**
 * Handles message updates (streaming)
 * Updates both streaming state and active chat messages
 */
function handleMessageUpdated(
  update: Extract<ChatUpdate, { type: 'message-updated' }>,
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>,
  setStreamingState: React.Dispatch<
    React.SetStateAction<MessageStreamingState>
  >,
) {
  // Update streaming state
  setStreamingState((prev) => {
    const newStreamingParts = new Map(prev.streamingParts);

    if (!newStreamingParts.has(update.update.messageId)) {
      newStreamingParts.set(update.update.messageId, new Map());
    }

    const messageParts = newStreamingParts.get(update.update.messageId)!;

    if (
      update.update.updateType === 'create' ||
      update.update.updateType === 'replace'
    ) {
      if (
        update.update.content.type === 'text' ||
        update.update.content.type === 'reasoning'
      ) {
        messageParts.set(update.update.partIndex, update.update.content);
      }
    } else if (update.update.updateType === 'append') {
      const existingPart = messageParts.get(update.update.partIndex);
      if (
        existingPart &&
        existingPart.type === 'text' &&
        update.update.content.type === 'text'
      ) {
        messageParts.set(update.update.partIndex, {
          ...existingPart,
          text: existingPart.text + update.update.content.text,
        });
      }
    }

    return { streamingParts: newStreamingParts };
  });

  // Also update the active chat's messages
  setChatState((prev) => {
    if (!prev.activeChat || prev.activeChat.id !== update.chatId) {
      return prev;
    }

    const updatedMessages = prev.activeChat.messages.map((msg) => {
      if (msg.id === update.update.messageId && msg.role === 'assistant') {
        const assistantMsg = msg as AssistantMessage;
        const newContent = [...assistantMsg.content];

        // Only update if the content type is valid for AssistantMessage
        const validTypes = [
          'text',
          'file',
          'reasoning',
          'tool-call',
          'tool-result',
        ];
        if (!validTypes.includes(update.update.content.type)) {
          return msg; // Skip invalid content types like tool-approval
        }

        if (
          update.update.updateType === 'create' ||
          update.update.updateType === 'replace'
        ) {
          newContent[update.update.partIndex] = update.update
            .content as AssistantMessage['content'][0];
        } else if (update.update.updateType === 'append') {
          const existingPart = newContent[update.update.partIndex];
          if (
            existingPart &&
            existingPart.type === 'text' &&
            update.update.content.type === 'text'
          ) {
            newContent[update.update.partIndex] = {
              ...existingPart,
              text: existingPart.text + update.update.content.text,
            };
          }
        }

        return { ...assistantMsg, content: newContent };
      }
      return msg;
    });

    return {
      ...prev,
      activeChat: {
        ...prev.activeChat,
        messages: updatedMessages,
      },
    };
  });
}

/**
 * Handles agent state updates
 */
function handleAgentState(
  update: Extract<ChatUpdate, { type: 'agent-state' }>,
  setIsWorking: React.Dispatch<React.SetStateAction<boolean>>,
) {
  setIsWorking(update.isWorking);
}
