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
  ToolDefinition,
  ToolApprovalResponse,
  ChatUpdate,
  UserMessage as ChatUserMessage,
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
   * Simple state operations with optional descriptions
   */
  state: {
    /** Get current agent state */
    get: () => AgentState;

    /** Set agent state with optional description */
    set: (state: AgentStateType, description?: string) => void;
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
    addUserMessageListener: (listener: (message: MessagingUserMessage) => void) => void;

    /** Remove a specific user message listener */
    removeUserMessageListener: (
      listener: (message: MessagingUserMessage) => void,
    ) => void;

    /** Clear all user message listeners */
    clearUserMessageListeners: () => void;
  };

  /**
   * CHAT MANAGEMENT
   * Comprehensive chat functionality with message history and tool integration
   */
  chat: {
    /** Enable or disable chat support */
    setChatSupport: (supported: boolean) => void;

    /** Check if chat is supported */
    isSupported: () => boolean;

    /** Get list of all chats */
    getChats: () => ChatListItem[];

    /** Get the active chat */
    getActiveChat: () => Chat | null;

    /** Create a new chat */
    createChat: (title?: string) => Promise<string>;

    /** Delete a chat */
    deleteChat: (chatId: string) => Promise<void>;

    /** Switch to a different chat */
    switchChat: (chatId: string) => Promise<void>;

    /** Update the title of a chat */
    updateChatTitle: (chatId: string, title: string) => Promise<void>;

    /** Add a message to the active chat */
    addMessage: (message: ChatMessage) => void;

    /** Update an existing message */
    updateMessage: (messageId: string, content: AssistantMessage['content']) => void;

    /** Delete a message from the chat */
    deleteMessage: (messageId: string) => void;

    /** Clear all messages from the active chat */
    clearMessages: () => void;

    /** Send a message to the active chat */
    sendMessage: (content: ChatUserMessage['content'], metadata: ChatUserMessage['metadata']) => Promise<void>;

    /** Stream a message part update */
    streamMessagePart: (messageId: string, partIndex: number, update: MessagePartUpdate) => void;

    /** Handle tool approval response */
    handleToolApproval: (response: ToolApprovalResponse) => Promise<void>;

    /** Register toolbar-provided tools */
    registerTools: (tools: ToolDefinition[]) => void;

    /** Report tool execution result */
    reportToolResult: (toolCallId: string, result: unknown, isError?: boolean) => void;

    /** Add listener for chat updates */
    addChatUpdateListener: (listener: (update: ChatUpdate) => void) => void;

    /** Remove chat update listener */
    removeChatUpdateListener: (listener: (update: ChatUpdate) => void) => void;

    // Persistence placeholders
    /** Load chat history (placeholder for future implementation) */
    loadChatHistory: () => Promise<void>;

    /** Save chat history (placeholder for future implementation) */
    saveChatHistory: () => Promise<void>;
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
