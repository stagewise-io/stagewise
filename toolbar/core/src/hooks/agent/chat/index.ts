/**
 * Agent Chat Hook Module
 * 
 * This module provides hooks and components for managing chat
 * functionality with the connected agent.
 */

// Main hook and provider
export { AgentChatProvider, useAgentChat } from './use-agent-chat';

// Helper hooks for common use cases
export {
  useActiveChatMessages,
  useActiveChatPendingTools,
  useIsMessageStreaming,
  useChatStats,
  useStreamingMessage,
  useIsChatReady,
  useChatError,
} from './helper-hooks';

// Type exports for consumers who need them
export type {
  ChatState,
  MessageStreamingState,
  PendingToolCall,
  ChatContextValue,
} from './types';