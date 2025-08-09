/**
 * Type definitions for the agent chat functionality
 *
 * This file contains all the types used by the chat hook system,
 * including state interfaces, context values, and utility types.
 */

import type {
  Chat,
  ChatListItem,
  ChatMessage,
  UserMessage,
  AssistantMessage,
  ToolDefinition,
  TextPart,
  ReasoningPart,
  ToolCallPart,
} from '@stagewise/agent-interface-internal/toolbar';

/**
 * Core chat state interface
 * Represents the current state of all chats and the active chat
 */
export interface ChatState {
  /** List of all available chats */
  chats: ChatListItem[];

  /** The currently active chat with full message history */
  activeChat: Chat | null;

  /** Whether an operation is in progress */
  isLoading: boolean;

  /** Error message if something went wrong */
  error: string | null;
}

/**
 * Message streaming state interface
 * Tracks messages that are currently being streamed from the agent
 */
export interface MessageStreamingState {
  /**
   * Map of messageId -> partIndex -> content
   * Used to track partial message updates during streaming
   */
  streamingParts: Map<string, Map<number, TextPart | ReasoningPart>>;
}

/**
 * Represents a tool call that requires user approval
 */
export interface PendingToolCall {
  /** ID of the chat containing this tool call */
  chatId: string;

  /** ID of the message containing this tool call */
  messageId: string;

  /** The actual tool call requiring approval */
  toolCall: ToolCallPart;

  /** When this tool call was created */
  timestamp: Date;
}

/**
 * Complete context value provided by the chat provider
 * This is what consumers of the hook receive
 */
export interface ChatContextValue {
  // ===== State Properties =====

  /** List of all available chats */
  chats: ChatListItem[];

  /** The currently active chat */
  activeChat: Chat | null;

  /** Whether an operation is in progress */
  isLoading: boolean;

  /** Current error message, if any */
  error: string | null;

  /** Whether the agent is currently working/processing */
  isWorking: boolean;

  /** Optional description of what the agent is currently doing */
  stateDescription?: string;

  // ===== Streaming State =====

  /** Messages currently being streamed (partial updates) */
  streamingMessages: Map<string, AssistantMessage>;

  // ===== Tool State =====

  /** Tool calls awaiting user approval */
  pendingToolCalls: PendingToolCall[];

  /** Tools available for use in chats */
  availableTools: ToolDefinition[];

  // ===== Chat Management Functions =====

  /**
   * Creates a new chat
   * @param title - Optional title for the chat
   * @returns The ID of the created chat, or null if failed
   */
  createChat: (title?: string) => Promise<string | null>;

  /**
   * Deletes a chat
   * @param chatId - ID of the chat to delete
   * @returns True if successful, false otherwise
   */
  deleteChat: (chatId: string) => Promise<boolean>;

  /**
   * Switches to a different chat
   * @param chatId - ID of the chat to switch to
   * @returns True if successful, false otherwise
   */
  switchChat: (chatId: string) => Promise<boolean>;

  /**
   * Updates the title of a chat
   * @param chatId - ID of the chat to update
   * @param title - New title for the chat
   * @returns True if successful, false otherwise
   */
  updateChatTitle: (chatId: string, title: string) => Promise<boolean>;

  /**
   * Deletes a message and all subsequent messages in a chat
   * @param messageId - ID of the message to delete from
   * @param chatId - Optional chat ID (defaults to active chat)
   * @returns True if successful, false otherwise
   */
  deleteMessageAndSubsequent: (
    messageId: string,
    chatId?: string,
  ) => Promise<boolean>;

  // ===== Messaging Functions =====

  /**
   * Sends a message in the active chat
   * @param content - Message content (text, images, etc.)
   * @param metadata - Optional metadata for the message
   */
  sendMessage: (
    content: UserMessage['content'],
    metadata: UserMessage['metadata'],
  ) => Promise<void>;

  // ===== Tool Handling Functions =====

  /**
   * Approves or rejects a tool call
   * @param toolCallId - ID of the tool call
   * @param approved - Whether to approve the call
   * @param modifiedInput - Optional modified parameters for the tool
   */
  approveToolCall: (
    toolCallId: string,
    approved: boolean,
    modifiedInput?: Record<string, unknown>,
  ) => Promise<void>;

  /**
   * Registers available tools with the chat system
   * @param tools - Array of tool definitions
   */
  registerTools: (tools: ToolDefinition[]) => void;

  /**
   * Reports the result of a tool execution
   * @param toolCallId - ID of the tool call
   * @param result - Result of the tool execution
   * @param isError - Whether the result is an error
   */
  reportToolResult: (
    toolCallId: string,
    result: unknown,
    isError?: boolean,
  ) => void;

  // ===== Utility Functions =====

  /** Forces a refresh of the chat list */
  refreshChats: () => void;

  /** Clears the current error message */
  clearError: () => void;

  // ===== Computed Helpers =====

  /**
   * Gets a message by its ID from the active chat
   * @param messageId - ID of the message to find
   * @returns The message if found, undefined otherwise
   */
  getMessageById: (messageId: string) => ChatMessage | undefined;

  /**
   * Gets a chat by its ID
   * @param chatId - ID of the chat to find
   * @returns The chat if found, undefined otherwise
   */
  getChatById: (chatId: string) => ChatListItem | undefined;

  /**
   * Whether it's currently possible to switch chats
   */
  canSwitchChat: boolean;

  /**
   * Whether it's currently possible to create a new chat
   */
  canCreateChat: boolean;

  // ===== Agent Control Functions =====

  /**
   * Stops the agent's current operation
   */
  stopAgent: () => Promise<void>;

  /**
   * Whether the agent can currently be stopped
   */
  canStop: boolean;
}
