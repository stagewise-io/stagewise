/**
 * Agent Chat Hook
 * 
 * This file re-exports the chat functionality from the chat module
 * to maintain backward compatibility with existing imports.
 * 
 * New code should import directly from './chat' instead.
 */

export {
  // Main exports
  AgentChatProvider,
  useAgentChat,
  
  // Helper hooks
  useActiveChatMessages,
  useActiveChatPendingTools,
  useIsMessageStreaming,
  useChatStats,
  useStreamingMessage,
  useIsChatReady,
  useChatError,
  
  // Types
  type ChatState,
  type MessageStreamingState,
  type PendingToolCall,
  type ChatContextValue,
} from './chat';