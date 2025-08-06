/**
 * Helper hooks for common chat use cases
 * 
 * These hooks provide convenient shortcuts for accessing
 * specific parts of the chat state or computed values.
 */

import { useMemo } from 'react';
import { useAgentChat } from './use-agent-chat';

/**
 * Hook to get only the active chat's messages
 * 
 * @returns Array of messages from the active chat, or empty array if no active chat
 */
export const useActiveChatMessages = () => {
  const { activeChat } = useAgentChat();
  return activeChat?.messages || [];
};

/**
 * Hook to get pending tool calls for the active chat
 * 
 * @returns Array of pending tool calls for the current chat only
 */
export const useActiveChatPendingTools = () => {
  const { pendingToolCalls, activeChat } = useAgentChat();
  
  return useMemo(() => {
    if (!activeChat) return [];
    return pendingToolCalls.filter(call => call.chatId === activeChat.id);
  }, [pendingToolCalls, activeChat]);
};

/**
 * Hook to check if a specific message is currently streaming
 * 
 * @param messageId - ID of the message to check
 * @returns True if the message is currently being streamed
 */
export const useIsMessageStreaming = (messageId: string) => {
  const { streamingMessages } = useAgentChat();
  return streamingMessages.has(messageId);
};

/**
 * Hook to get chat statistics
 * 
 * @returns Object containing various chat statistics
 */
export const useChatStats = () => {
  const { chats, activeChat } = useAgentChat();
  
  return useMemo(() => ({
    /** Total number of chats */
    totalChats: chats.length,
    
    /** Total messages in the active chat */
    totalMessages: activeChat?.messages.length || 0,
    
    /** Whether there is an active chat */
    hasActiveChat: !!activeChat,
    
    /** ID of the active chat */
    activeChatId: activeChat?.id || null,
  }), [chats, activeChat]);
};

/**
 * Hook to get the streaming content for a specific message
 * 
 * @param messageId - ID of the message to get streaming content for
 * @returns The streaming message if it exists, undefined otherwise
 */
export const useStreamingMessage = (messageId: string) => {
  const { streamingMessages } = useAgentChat();
  return streamingMessages.get(messageId);
};

/**
 * Hook to check if the chat system is ready for interaction
 * 
 * @returns True if chat is supported and not loading
 */
export const useIsChatReady = () => {
  const { isSupported, isLoading } = useAgentChat();
  return isSupported && !isLoading;
};

/**
 * Hook to get error state and clear function
 * 
 * @returns Object with error message and function to clear it
 */
export const useChatError = () => {
  const { error, clearError } = useAgentChat();
  
  return {
    /** Current error message, if any */
    error,
    
    /** Function to clear the error */
    clearError,
    
    /** Whether there is an error */
    hasError: !!error,
  };
};