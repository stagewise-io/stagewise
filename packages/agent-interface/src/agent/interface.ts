import type {
  Chat,
  ChatListItem,
  ChatMessage,
  AssistantMessage,
  MessagePartUpdate,
  ChatUpdate,
} from '../router/capabilities/chat/types';

export type AgentInterface = {
  /**
   * CHAT MANAGEMENT
   * Chat functionality for the agent to manage conversations and messages
   * Note: Tool approvals, registrations, and user messages come through router callbacks
   */
  chat: {
    /** Get list of all chats */
    getChats: () => ChatListItem[];

    /** Get the ID of the currently active chat */
    getActiveChatId: () => string | null;

    /** Get the active chat */
    getActiveChat: () => Chat | null;

    /** Create a new chat (agent can create anytime) */
    createChat: (title?: string) => Promise<string>;

    /** Delete a chat */
    deleteChat: (chatId: string) => Promise<void>;

    /** Switch to a different chat */
    switchChat: (chatId: string) => Promise<void>;

    /** Update the title of a chat */
    updateChatTitle: (chatId: string, title: string) => Promise<void>;

    /** Add a message to any chat (for agent-generated messages) */
    addMessage: (message: ChatMessage, chatId?: string) => void;

    /** Update an existing message in any chat */
    updateMessage: (
      messageId: string,
      content: AssistantMessage['content'],
      chatId?: string,
    ) => void;

    /** Delete a message from any chat */
    deleteMessage: (messageId: string, chatId?: string) => void;

    /** Delete a message and all subsequent messages from any chat */
    deleteMessageAndSubsequent: (messageId: string, chatId?: string) => void;

    /** Clear all messages from a specific chat */
    clearMessages: (chatId?: string) => void;

    /** Stream a message part update */
    streamMessagePart: (
      messageId: string,
      partIndex: number,
      update: MessagePartUpdate,
      chatId?: string,
    ) => void;

    /** Add listener for chat updates (includes user messages and tool approvals) */
    addChatUpdateListener: (listener: (update: ChatUpdate) => void) => void;

    /** Remove chat update listener */
    removeChatUpdateListener: (listener: (update: ChatUpdate) => void) => void;

    /** Set the agent's working state (broadcasts to toolbar via chat updates) */
    setWorkingState: (isWorking: boolean, description?: string) => void;

    /** Add a listener for stop signals from the toolbar */
    addStopListener: (listener: () => void) => void;

    /** Remove a stop listener */
    removeStopListener: (listener: () => void) => void;
  };

  /**
   * CLEANUP MANAGEMENT
   * Methods to properly clean up resources and prevent memory leaks
   */
  cleanup: {
    /** Clear all listeners and cleanup resources */
    clearAllListeners: () => void;
  };
};
