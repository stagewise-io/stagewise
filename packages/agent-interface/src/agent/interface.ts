import type {
  AgentAvailability,
  AgentAvailabilityError,
} from '../router/capabilities/availability/types';
import type {
  AgentMessageContentItemPart,
  UserMessage as MessagingUserMessage,
} from '../router/capabilities/messaging/types';
import type {
  AgentState,
  AgentStateType,
} from '../router/capabilities/state/types';
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
   * AVAILABILITY MANAGEMENT
   * Simple boolean-based availability with error handling
   */
  availability: {
    /** Get current availability status */
    get: () => AgentAvailability;

    /**
     * Set agent availability.
     *
     * When setting available to false, an error type is required to indicate
     * the reason for unavailability. The errorMessage parameter is optional
     * and provides additional context about the error.
     *
     * When setting available to true, error parameters are ignored.
     */
    set: <T extends boolean>(
      available: T,
      ...args: T extends false
        ? [error: AgentAvailabilityError, errorMessage?: string]
        : []
    ) => void;
  };

  /**
   * STATE MANAGEMENT
   * Simple state operations with optional descriptions and stop signal handling
   */
  state: {
    /** Get current agent state */
    get: () => AgentState;

    /** Set agent state with optional description */
    set: (state: AgentStateType, description?: string) => void;

    /** Add listener for stop signals from toolbar */
    addStopListener: (listener: () => void) => void;

    /** Remove stop listener */
    removeStopListener: (listener: () => void) => void;
  };

  /**
   * MESSAGE MANAGEMENT
   * High-level message operations with automatic concatenation
   */
  messaging: {
    /** Get current agent message content (returns concatenated message) */
    get: () => AgentMessageContentItemPart[];

    /** Set complete agent message (replaces all content) */
    set: (content: AgentMessageContentItemPart[]) => void;

    /** Append a new part to current message */
    addPart: (
      content: AgentMessageContentItemPart | AgentMessageContentItemPart[],
    ) => void;

    /**
     * Update a part of the current message.
     *
     * @param content - The content to update with
     * @param index - The index of the part to update. If index equals the current
     *                message length (highest index + 1), a new part will be added.
     * @param type - 'replace' to replace the part, 'append' to append text (text parts only).
     *               When using 'append', only the delta (new text) is sent in the update,
     *               not the entire content.
     */
    updatePart: (
      content: AgentMessageContentItemPart | AgentMessageContentItemPart[],
      index: number,
      type: 'replace' | 'append',
    ) => void;

    /** Clears current message and starts a new one. Will change the current ID.*/
    clear: () => void;

    /** Get current message ID */
    getCurrentId: () => string | null;

    /** Get current message state as an object (returns by value, not reference) */
    getCurrentMessage: () => {
      id: string | null;
      parts: AgentMessageContentItemPart[];
    };

    /** Add a listener for user messages */
    addUserMessageListener: (
      listener: (message: MessagingUserMessage) => void,
    ) => void;

    /** Remove a specific user message listener */
    removeUserMessageListener: (
      listener: (message: MessagingUserMessage) => void,
    ) => void;

    /** Clear all user message listeners */
    clearUserMessageListeners: () => void;
  };

  /**
   * CHAT MANAGEMENT
   * Chat functionality for the agent to manage conversations and messages
   * Note: Tool approvals, registrations, and user messages come through router callbacks
   */
  chat: {
    /** Enable or disable chat support */
    setChatSupport: (supported: boolean) => void;

    /** Check if chat is supported */
    isSupported: () => boolean;

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
