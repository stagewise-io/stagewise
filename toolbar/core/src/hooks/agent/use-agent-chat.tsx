import {
  useState,
  useEffect,
  useContext,
  useMemo,
  useCallback,
  useRef,
  createContext,
  type ReactNode,
} from 'react';
import type {
  Chat,
  ChatListItem,
  ChatMessage,
  ChatUpdate,
  ChatUserMessage,
  AssistantMessage,
  ToolMessage,
  MessagePartUpdate,
  ToolDefinition,
  ToolApprovalResponse,
  TextPart,
  ImagePart,
  FilePart,
  ReasoningPart,
  ToolCallPart,
  ToolResultPart,
  CreateChatRequest,
  SendMessageRequest,
} from '@stagewise/agent-interface/toolbar';
import { useAgents } from './use-agent-provider';

// ============================================
// Types
// ============================================

interface ChatState {
  chats: ChatListItem[];
  activeChat: Chat | null;
  isLoading: boolean;
  error: string | null;
}

interface MessageStreamingState {
  // Map of messageId -> partIndex -> content
  streamingParts: Map<string, Map<number, TextPart | ReasoningPart>>;
}

interface PendingToolCall {
  chatId: string;
  messageId: string;
  toolCall: ToolCallPart;
  timestamp: Date;
}

interface ChatContextValue {
  // State
  chats: ChatListItem[];
  activeChat: Chat | null;
  isLoading: boolean;
  error: string | null;
  isSupported: boolean;
  
  // Streaming state
  streamingMessages: Map<string, AssistantMessage>;
  
  // Tool state
  pendingToolCalls: PendingToolCall[];
  availableTools: ToolDefinition[];
  
  // Chat management
  createChat: (title?: string) => Promise<string | null>;
  deleteChat: (chatId: string) => Promise<boolean>;
  switchChat: (chatId: string) => Promise<boolean>;
  
  // Messaging
  sendMessage: (content: ChatUserMessage['content'], metadata: ChatUserMessage['metadata']) => Promise<void>;
  
  // Tool handling
  approveToolCall: (toolCallId: string, approved: boolean, modifiedInput?: Record<string, unknown>) => Promise<void>;
  registerTools: (tools: ToolDefinition[]) => void;
  reportToolResult: (toolCallId: string, result: unknown, isError?: boolean) => void;
  
  // Utility
  refreshChats: () => void;
  clearError: () => void;
  
  // Computed helpers
  getMessageById: (messageId: string) => ChatMessage | undefined;
  getChatById: (chatId: string) => ChatListItem | undefined;
  canSwitchChat: () => boolean;
  canCreateChat: () => boolean;
}

// ============================================
// Context
// ============================================

const ChatContext = createContext<ChatContextValue>({
  chats: [],
  activeChat: null,
  isLoading: false,
  error: null,
  isSupported: false,
  streamingMessages: new Map(),
  pendingToolCalls: [],
  availableTools: [],
  createChat: async () => null,
  deleteChat: async () => false,
  switchChat: async () => false,
  sendMessage: async () => {},
  approveToolCall: async () => {},
  registerTools: () => {},
  reportToolResult: () => {},
  refreshChats: () => {},
  clearError: () => {},
  getMessageById: () => undefined,
  getChatById: () => undefined,
  canSwitchChat: () => false,
  canCreateChat: () => false,
});

// ============================================
// Provider Component
// ============================================

export const AgentChatProvider = ({ children }: { children?: ReactNode }) => {
  const agent = useAgents().connected;
  
  // Core state
  const [chatState, setChatState] = useState<ChatState>({
    chats: [],
    activeChat: null,
    isLoading: false,
    error: null,
  });
  
  // Check if chat is supported
  const [isSupported, setIsSupported] = useState(false);
  
  // Streaming messages state
  const [streamingState, setStreamingState] = useState<MessageStreamingState>({
    streamingParts: new Map(),
  });
  
  // Tool state
  const [pendingToolCalls, setPendingToolCalls] = useState<PendingToolCall[]>([]);
  const [availableTools, setAvailableTools] = useState<ToolDefinition[]>([]);
  
  // Refs for subscription management
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const processedUpdatesRef = useRef<Set<string>>(new Set());
  
  // ============================================
  // Chat Update Handler
  // ============================================
  
  const handleChatUpdate = useCallback((update: ChatUpdate) => {
    // Create unique key to prevent double processing
    const updateKey = `${update.type}-${JSON.stringify(update)}`;
    
    if (processedUpdatesRef.current.has(updateKey)) {
      return;
    }
    
    processedUpdatesRef.current.add(updateKey);
    
    // Clean up old processed updates
    if (processedUpdatesRef.current.size > 200) {
      const entries = Array.from(processedUpdatesRef.current);
      processedUpdatesRef.current = new Set(entries.slice(-100));
    }
    
    switch (update.type) {
      case 'chat-list':
        setChatState(prev => ({
          ...prev,
          chats: update.chats,
          isLoading: false,
        }));
        break;
        
      case 'chat-created':
        setChatState(prev => ({
          ...prev,
          chats: [...prev.chats, {
            id: update.chat.id,
            title: update.chat.title,
            createdAt: update.chat.createdAt,
            isActive: update.chat.isActive,
            messageCount: update.chat.messages.length,
          }],
          activeChat: update.chat.isActive ? update.chat : prev.activeChat,
          isLoading: false,
        }));
        break;
        
      case 'chat-deleted':
        setChatState(prev => ({
          ...prev,
          chats: prev.chats.filter(c => c.id !== update.chatId),
          activeChat: prev.activeChat?.id === update.chatId ? null : prev.activeChat,
          isLoading: false,
        }));
        break;
        
      case 'chat-switched':
        setChatState(prev => ({
          ...prev,
          chats: prev.chats.map(c => ({
            ...c,
            isActive: c.id === update.chatId,
          })),
          isLoading: false,
        }));
        break;
        
      case 'chat-full-sync':
        setChatState(prev => ({
          ...prev,
          activeChat: update.chat,
          chats: prev.chats.map(c => 
            c.id === update.chat.id 
              ? { ...c, isActive: true, messageCount: update.chat.messages.length }
              : { ...c, isActive: false }
          ),
          isLoading: false,
        }));
        
        // Extract pending tool calls from the synced chat
        const pendingCalls: PendingToolCall[] = [];
        update.chat.messages.forEach(msg => {
          if (msg.role === 'assistant') {
            const assistantMsg = msg as AssistantMessage;
            assistantMsg.content.forEach(part => {
              if (part.type === 'tool-call' && part.requiresApproval) {
                // Check if there's no corresponding approval/result yet
                const hasResponse = update.chat.messages.some(m => 
                  m.role === 'tool' && 
                  (m as ToolMessage).content.some(r => r.toolCallId === part.toolCallId)
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
        break;
        
      case 'message-added':
        setChatState(prev => {
          if (!prev.activeChat || prev.activeChat.id !== update.chatId) {
            return prev;
          }
          
          return {
            ...prev,
            activeChat: {
              ...prev.activeChat,
              messages: [...prev.activeChat.messages, update.message],
            },
            chats: prev.chats.map(c => 
              c.id === update.chatId 
                ? { ...c, messageCount: c.messageCount + 1 }
                : c
            ),
          };
        });
        
        // Check for new pending tool calls
        if (update.message.role === 'assistant') {
          const assistantMsg = update.message as AssistantMessage;
          const newPendingCalls: PendingToolCall[] = [];
          assistantMsg.content.forEach(part => {
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
            setPendingToolCalls(prev => [...prev, ...newPendingCalls]);
          }
        }
        break;
        
      case 'message-updated':
        // Handle streaming updates
        setStreamingState(prev => {
          const newStreamingParts = new Map(prev.streamingParts);
          
          if (!newStreamingParts.has(update.update.messageId)) {
            newStreamingParts.set(update.update.messageId, new Map());
          }
          
          const messageParts = newStreamingParts.get(update.update.messageId)!;
          
          if (update.update.updateType === 'create' || update.update.updateType === 'replace') {
            if (update.update.content.type === 'text' || update.update.content.type === 'reasoning') {
              messageParts.set(update.update.partIndex, update.update.content);
            }
          } else if (update.update.updateType === 'append') {
            const existingPart = messageParts.get(update.update.partIndex);
            if (existingPart && existingPart.type === 'text' && update.update.content.type === 'text') {
              messageParts.set(update.update.partIndex, {
                ...existingPart,
                text: existingPart.text + update.update.content.text,
              });
            }
          }
          
          return { streamingParts: newStreamingParts };
        });
        
        // Also update the active chat's messages
        setChatState(prev => {
          if (!prev.activeChat || prev.activeChat.id !== update.chatId) {
            return prev;
          }
          
          const updatedMessages = prev.activeChat.messages.map(msg => {
            if (msg.id === update.update.messageId && msg.role === 'assistant') {
              const assistantMsg = msg as AssistantMessage;
              const newContent = [...assistantMsg.content];
              
              if (update.update.updateType === 'create' || update.update.updateType === 'replace') {
                newContent[update.update.partIndex] = update.update.content;
              } else if (update.update.updateType === 'append') {
                const existingPart = newContent[update.update.partIndex];
                if (existingPart && existingPart.type === 'text' && update.update.content.type === 'text') {
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
        break;
    }
  }, []);
  
  // ============================================
  // Subscription Management
  // ============================================
  
  useEffect(() => {
    if (agent && agent.info.capabilities?.chatHistory) {
      setIsSupported(true);
      
      // Subscribe to chat updates
      const subscription = agent.agent.chat.getChatUpdates.subscribe(undefined, {
        onData: (update: ChatUpdate) => {
          handleChatUpdate(update);
        },
        onError: (error: unknown) => {
          console.error('Chat subscription error:', error);
          setChatState(prev => ({
            ...prev,
            error: 'Failed to connect to chat service',
            isLoading: false,
          }));
        },
      });
      
      subscriptionRef.current = subscription;
      
      return () => {
        subscription.unsubscribe();
        subscriptionRef.current = null;
      };
    } else {
      setIsSupported(false);
      setChatState({
        chats: [],
        activeChat: null,
        isLoading: false,
        error: null,
      });
    }
  }, [agent, handleChatUpdate]);
  
  // ============================================
  // Chat Management Functions
  // ============================================
  
  const createChat = useCallback(async (title?: string): Promise<string | null> => {
    if (!agent) return null;
    
    try {
      setChatState(prev => ({ ...prev, isLoading: true, error: null }));
      const chatId = await agent.agent.chat.createChat.mutate(title ? { title } : {});
      return chatId;
    } catch (error) {
      setChatState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to create chat',
      }));
      return null;
    }
  }, [agent]);
  
  const deleteChat = useCallback(async (chatId: string): Promise<boolean> => {
    if (!agent) return false;
    
    try {
      setChatState(prev => ({ ...prev, isLoading: true, error: null }));
      await agent.agent.chat.deleteChat.mutate(chatId);
      return true;
    } catch (error) {
      setChatState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to delete chat',
      }));
      return false;
    }
  }, [agent]);
  
  const switchChat = useCallback(async (chatId: string): Promise<boolean> => {
    if (!agent) return false;
    
    try {
      setChatState(prev => ({ ...prev, isLoading: true, error: null }));
      await agent.agent.chat.switchChat.mutate(chatId);
      return true;
    } catch (error) {
      setChatState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to switch chat',
      }));
      return false;
    }
  }, [agent]);
  
  // ============================================
  // Messaging Functions
  // ============================================
  
  const sendMessage = useCallback(async (
    content: ChatUserMessage['content'],
    metadata: ChatUserMessage['metadata']
  ): Promise<void> => {
    if (!agent || !chatState.activeChat) {
      setChatState(prev => ({
        ...prev,
        error: 'No active chat or agent connection',
      }));
      return;
    }
    
    try {
      setChatState(prev => ({ ...prev, error: null }));
      await agent.agent.chat.sendMessage.mutate({
        chatId: chatState.activeChat.id,
        content,
        metadata,
      });
    } catch (error) {
      setChatState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to send message',
      }));
    }
  }, [agent, chatState.activeChat]);
  
  // ============================================
  // Tool Functions
  // ============================================
  
  const approveToolCall = useCallback(async (
    toolCallId: string,
    approved: boolean,
    modifiedInput?: Record<string, unknown>
  ): Promise<void> => {
    if (!agent) return;
    
    try {
      await agent.agent.chat.approveToolCall.mutate({
        toolCallId,
        approved,
        modifiedInput,
      });
      
      // Remove from pending calls
      setPendingToolCalls(prev => 
        prev.filter(call => call.toolCall.toolCallId !== toolCallId)
      );
    } catch (error) {
      console.error('Failed to approve tool call:', error);
    }
  }, [agent]);
  
  const registerTools = useCallback((tools: ToolDefinition[]) => {
    if (!agent) return;
    
    try {
      agent.agent.chat.registerTools.mutate(tools);
      setAvailableTools(tools);
    } catch (error) {
      console.error('Failed to register tools:', error);
    }
  }, [agent]);
  
  const reportToolResult = useCallback((
    toolCallId: string,
    result: unknown,
    isError?: boolean
  ) => {
    if (!agent) return;
    
    try {
      agent.agent.chat.reportToolResult.mutate({
        toolCallId,
        result,
        isError,
      });
    } catch (error) {
      console.error('Failed to report tool result:', error);
    }
  }, [agent]);
  
  // ============================================
  // Utility Functions
  // ============================================
  
  const refreshChats = useCallback(() => {
    // Force a reconnection to get fresh data
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      
      if (agent && agent.info.capabilities?.chatHistory) {
        const subscription = agent.agent.chat.getChatUpdates.subscribe(undefined, {
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
    setChatState(prev => ({ ...prev, error: null }));
  }, []);
  
  const getMessageById = useCallback((messageId: string): ChatMessage | undefined => {
    if (!chatState.activeChat) return undefined;
    return chatState.activeChat.messages.find(m => m.id === messageId);
  }, [chatState.activeChat]);
  
  const getChatById = useCallback((chatId: string): ChatListItem | undefined => {
    return chatState.chats.find(c => c.id === chatId);
  }, [chatState.chats]);
  
  const canSwitchChat = useCallback((): boolean => {
    // Can switch if agent is idle (would need agent state hook integration)
    return !chatState.isLoading;
  }, [chatState.isLoading]);
  
  const canCreateChat = useCallback((): boolean => {
    // Can create if agent is idle
    return !chatState.isLoading;
  }, [chatState.isLoading]);
  
  // ============================================
  // Build streaming messages map
  // ============================================
  
  const streamingMessages = useMemo(() => {
    const map = new Map<string, AssistantMessage>();
    
    streamingState.streamingParts.forEach((parts, messageId) => {
      const content: AssistantMessage['content'] = [];
      
      // Sort parts by index and add to content
      const sortedParts = Array.from(parts.entries()).sort((a, b) => a[0] - b[0]);
      sortedParts.forEach(([_, part]) => {
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
  
  // ============================================
  // Context Value
  // ============================================
  
  const contextValue: ChatContextValue = {
    // State
    chats: chatState.chats,
    activeChat: chatState.activeChat,
    isLoading: chatState.isLoading,
    error: chatState.error,
    isSupported,
    
    // Streaming state
    streamingMessages,
    
    // Tool state
    pendingToolCalls,
    availableTools,
    
    // Chat management
    createChat,
    deleteChat,
    switchChat,
    
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
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};

// ============================================
// Hook
// ============================================

export const useAgentChat = () => {
  return useContext(ChatContext);
};

// ============================================
// Helper Hooks for Common Use Cases
// ============================================

/**
 * Hook to get only the active chat's messages
 */
export const useActiveChatMessages = () => {
  const { activeChat } = useAgentChat();
  return activeChat?.messages || [];
};

/**
 * Hook to get pending tool calls for the active chat
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
 */
export const useIsMessageStreaming = (messageId: string) => {
  const { streamingMessages } = useAgentChat();
  return streamingMessages.has(messageId);
};

/**
 * Hook to get chat statistics
 */
export const useChatStats = () => {
  const { chats, activeChat } = useAgentChat();
  
  return useMemo(() => ({
    totalChats: chats.length,
    totalMessages: activeChat?.messages.length || 0,
    hasActiveChat: !!activeChat,
    activeChatId: activeChat?.id || null,
  }), [chats, activeChat]);
};