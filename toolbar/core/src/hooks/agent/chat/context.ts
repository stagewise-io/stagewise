/**
 * Chat context definition
 *
 * This file defines the React context for the chat system,
 * including the default values for all context properties.
 */

import { createContext } from 'react';
import type { ChatContextValue } from './types';

/**
 * Default context value used when no provider is present
 * All functions are no-ops and return appropriate default values
 */
const defaultContextValue: ChatContextValue = {
  // State
  chats: [],
  activeChat: null,
  isLoading: false,
  error: null,
  isSupported: false,

  // Streaming state
  streamingMessages: new Map(),

  // Tool state
  pendingToolCalls: [],
  availableTools: [],

  // Chat management - all return appropriate defaults
  createChat: async () => null,
  deleteChat: async () => false,
  switchChat: async () => false,
  updateChatTitle: async () => false,

  // Messaging
  sendMessage: async () => {},

  // Tool handling
  approveToolCall: async () => {},
  registerTools: () => {},
  reportToolResult: () => {},

  // Utility
  refreshChats: () => {},
  clearError: () => {},

  // Computed helpers
  getMessageById: () => undefined,
  getChatById: () => undefined,
  canSwitchChat: false,
  canCreateChat: false,
};

/**
 * React context for the chat system
 * Provides chat state and functions to all child components
 */
export const ChatContext = createContext<ChatContextValue>(defaultContextValue);
