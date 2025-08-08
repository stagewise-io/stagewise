/**
 * Main agent chat hook and provider
 *
 * This module provides the main hook for interacting with the agent's
 * chat functionality. It manages chat state, handles real-time updates,
 * and provides functions for chat operations.
 */

import {
  useState,
  useEffect,
  useContext,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type {
  ChatUpdate,
  AssistantMessage,
  ToolDefinition,
  SendMessageRequest,
} from '@stagewise/agent-interface-internal/toolbar';
import { useAgents } from '../use-agent-provider';
import { ChatContext } from './context';
import { createChatUpdateHandler } from './update-handler';
import type {
  ChatState,
  MessageStreamingState,
  PendingToolCall,
  ChatContextValue,
} from './types';

/**
 * Provider component for the chat system
 *
 * This component manages all chat state and provides it to child components
 * through React context. It handles subscriptions to chat updates and
 * provides all the functions needed to interact with the chat system.
 */
export const AgentChatProvider = ({ children }: { children?: ReactNode }) => {
  // Get the connected agent from the agent provider
  const agent = useAgents().connected;

  // ===== Core State Management =====

  const [chatState, setChatState] = useState<ChatState>({
    chats: [],
    activeChat: null,
    isLoading: false,
    error: null,
  });

  const [isWorking, setIsWorking] = useState(false);

  const [streamingState, setStreamingState] = useState<MessageStreamingState>({
    streamingParts: new Map(),
  });

  const [pendingToolCalls, setPendingToolCalls] = useState<PendingToolCall[]>(
    [],
  );
  const [availableTools, setAvailableTools] = useState<ToolDefinition[]>([]);

  // ===== Refs for Subscription Management =====

  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const processedUpdatesRef = useRef<Set<string>>(new Set());

  // ===== Chat Update Handler =====

  const handleChatUpdate = useCallback(
    createChatUpdateHandler(
      setChatState,
      setStreamingState,
      setPendingToolCalls,
      processedUpdatesRef,
      setIsWorking,
    ),
    [],
  );

  // ===== Subscription Management =====

  useEffect(() => {
    if (agent?.getChatUpdates) {
      // Subscribe to chat updates from the agent
      const subscription = agent.getChatUpdates.subscribe(undefined, {
        onData: (update: ChatUpdate) => {
          handleChatUpdate(update);
        },
        onError: (error: unknown) => {
          console.error('Chat subscription error:', error);
          setChatState((prev) => ({
            ...prev,
            error: 'Failed to connect to chat service',
            isLoading: false,
          }));
        },
      });

      subscriptionRef.current = subscription;

      // Cleanup subscription on unmount
      return () => {
        subscription.unsubscribe();
        subscriptionRef.current = null;
      };
    }
  }, [agent, handleChatUpdate]);

  // ===== Chat Management Functions =====

  const createChat = useCallback(
    async (title?: string): Promise<string | null> => {
      if (!agent) return null;

      try {
        setChatState((prev) => ({ ...prev, isLoading: true, error: null }));
        const chatId = await agent.createChat.mutate(title ? { title } : {});
        return chatId;
      } catch (error) {
        setChatState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error ? error.message : 'Failed to create chat',
        }));
        return null;
      }
    },
    [agent],
  );

  const deleteChat = useCallback(
    async (chatId: string): Promise<boolean> => {
      if (!agent) return false;

      try {
        setChatState((prev) => ({ ...prev, isLoading: true, error: null }));
        await agent.deleteChat.mutate(chatId);
        return true;
      } catch (error) {
        setChatState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error ? error.message : 'Failed to delete chat',
        }));
        return false;
      }
    },
    [agent],
  );

  const switchChat = useCallback(
    async (chatId: string): Promise<boolean> => {
      if (!agent) return false;

      try {
        setChatState((prev) => ({ ...prev, isLoading: true, error: null }));
        await agent.switchChat.mutate(chatId);
        return true;
      } catch (error) {
        setChatState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error ? error.message : 'Failed to switch chat',
        }));
        return false;
      }
    },
    [agent],
  );

  const updateChatTitle = useCallback(
    async (chatId: string, title: string): Promise<boolean> => {
      if (!agent) return false;

      try {
        setChatState((prev) => ({ ...prev, error: null }));
        await agent.updateChatTitle.mutate({ chatId, title });
        return true;
      } catch (error) {
        setChatState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to update chat title',
        }));
        return false;
      }
    },
    [agent],
  );

  const deleteMessageAndSubsequent = useCallback(
    async (messageId: string, chatId?: string): Promise<boolean> => {
      if (!agent?.deleteMessageAndSubsequent) {
        setChatState((prev) => ({
          ...prev,
          error: 'Delete message not supported',
        }));
        return false;
      }

      const targetChatId = chatId || chatState.activeChat?.id;
      if (!targetChatId) {
        setChatState((prev) => ({
          ...prev,
          error: 'No chat specified',
        }));
        return false;
      }

      try {
        await agent.deleteMessageAndSubsequent.mutate({
          chatId: targetChatId,
          messageId,
        });
        return true;
      } catch (error) {
        setChatState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : 'Failed to delete message',
        }));
        return false;
      }
    },
    [agent, chatState.activeChat],
  );

  // ===== Messaging Functions =====

  const sendMessage = useCallback(
    async (
      content: SendMessageRequest['content'],
      metadata: SendMessageRequest['metadata'],
    ): Promise<void> => {
      if (!agent || !chatState.activeChat) {
        setChatState((prev) => ({
          ...prev,
          error: 'No active chat or agent connection',
        }));
        return;
      }

      try {
        setChatState((prev) => ({ ...prev, error: null }));
        await agent.sendMessage.mutate({
          chatId: chatState.activeChat.id,
          content,
          metadata,
        });
      } catch (error) {
        setChatState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : 'Failed to send message',
        }));
      }
    },
    [agent, chatState.activeChat],
  );

  // ===== Tool Functions =====

  const approveToolCall = useCallback(
    async (toolCallId: string, approved: boolean): Promise<void> => {
      if (!agent) return;

      try {
        await agent.approveToolCall.mutate({
          toolCallId,
          approved,
        });

        // Remove from pending calls
        setPendingToolCalls((prev) =>
          prev.filter((call) => call.toolCall.toolCallId !== toolCallId),
        );
      } catch (error) {
        console.error('Failed to approve tool call:', error);
      }
    },
    [agent],
  );

  const registerTools = useCallback(
    (tools: ToolDefinition[]) => {
      if (!agent) return;

      try {
        agent.registerTools.mutate(tools);
        setAvailableTools(tools);
      } catch (error) {
        console.error('Failed to register tools:', error);
      }
    },
    [agent],
  );

  const reportToolResult = useCallback(
    (toolCallId: string, result: unknown, isError?: boolean) => {
      if (!agent) return;

      try {
        agent.reportToolResult.mutate({
          toolCallId,
          result,
          isError,
        });
      } catch (error) {
        console.error('Failed to report tool result:', error);
      }
    },
    [agent],
  );

  // ===== Agent Control Functions =====

  const stopAgent = useCallback(async () => {
    if (agent?.stop) {
      try {
        await agent.stop.mutate();
      } catch (error) {
        console.error('Failed to stop agent:', error);
        throw error;
      }
    }
  }, [agent]);

  const canStop = isWorking;

  // ===== Utility Functions =====

  const refreshChats = useCallback(() => {
    // Force a reconnection to get fresh data
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();

      if (agent) {
        const subscription = agent.getChatUpdates.subscribe(undefined, {
          onData: handleChatUpdate,
          onError: (error: unknown) => {
            console.error('Chat subscription error:', error);
          },
        });
        subscriptionRef.current = subscription;
      }
    }
  }, [agent, handleChatUpdate]);

  const clearError = useCallback(() => {
    setChatState((prev) => ({ ...prev, error: null }));
  }, []);

  const getMessageById = useCallback(
    (messageId: string) => {
      if (!chatState.activeChat) return undefined;
      return chatState.activeChat.messages.find((m) => m.id === messageId);
    },
    [chatState.activeChat],
  );

  const getChatById = useCallback(
    (chatId: string) => {
      return chatState.chats.find((c) => c.id === chatId);
    },
    [chatState.chats],
  );

  const canSwitchChat = useMemo(() => {
    // Can switch if not currently loading
    return !chatState.isLoading;
  }, [chatState.isLoading]);

  const canCreateChat = useMemo(() => {
    // Can create if not currently loading
    return !chatState.isLoading;
  }, [chatState.isLoading]);

  // ===== Build Streaming Messages Map =====

  const streamingMessages = useMemo(() => {
    const map = new Map<string, AssistantMessage>();

    streamingState.streamingParts.forEach((parts, messageId) => {
      const content: AssistantMessage['content'] = [];

      // Sort parts by index and add to content
      const sortedParts = Array.from(parts.entries()).sort(
        (a, b) => a[0] - b[0],
      );
      sortedParts.forEach(([, part]) => {
        content.push(part);
      });

      if (content.length > 0) {
        map.set(messageId, {
          id: messageId,
          role: 'assistant',
          content,
          createdAt: new Date(),
        });
      }
    });

    return map;
  }, [streamingState.streamingParts]);

  // ===== Build Context Value =====

  const contextValue: ChatContextValue = {
    // State
    chats: chatState.chats,
    activeChat: chatState.activeChat,
    isLoading: chatState.isLoading,
    error: chatState.error,
    isWorking,

    // Agent control
    stopAgent,
    canStop,

    // Streaming state
    streamingMessages,

    // Tool state
    pendingToolCalls,
    availableTools,

    // Chat management
    createChat,
    deleteChat,
    switchChat,
    updateChatTitle,
    deleteMessageAndSubsequent,

    // Messaging
    sendMessage,

    // Tool handling
    approveToolCall,
    registerTools,
    reportToolResult,

    // Utility
    refreshChats,
    clearError,

    // Computed helpers
    getMessageById,
    getChatById,
    canSwitchChat,
    canCreateChat,
  };

  return (
    <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
  );
};

/**
 * Main hook to access the chat context
 *
 * @returns The chat context value with all state and functions
 * @throws Error if used outside of AgentChatProvider
 */
export const useAgentChat = () => {
  const context = useContext(ChatContext);

  // Optional: Add a check to ensure the hook is used within a provider
  // This helps catch mistakes during development
  if (!context) {
    console.warn('useAgentChat must be used within an AgentChatProvider');
  }

  return context;
};
