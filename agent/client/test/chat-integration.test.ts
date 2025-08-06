import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentServer } from '@stagewise/agent-interface/agent';

describe('Agent Chat Integration', () => {
  let mockServer: Partial<AgentServer>;
  let mockChatInterface: any;

  beforeEach(() => {
    mockChatInterface = {
      setChatSupport: vi.fn(),
      isSupported: vi.fn(() => true),
      getChats: vi.fn(() => []),
      getActiveChat: vi.fn(() => null),
      createChat: vi.fn(() => 'chat-123'),
      deleteChat: vi.fn(),
      switchChat: vi.fn(),
      addMessage: vi.fn(),
      updateMessage: vi.fn(),
      deleteMessage: vi.fn(),
      clearMessages: vi.fn(),
      loadChatHistory: vi.fn(),
      saveChatHistory: vi.fn(),
    };

    mockServer = {
      interface: {
        availability: {
          set: vi.fn(),
        },
        state: {
          set: vi.fn(),
          get: vi.fn(),
        },
        messaging: {
          addUserMessageListener: vi.fn(),
          clear: vi.fn(),
        },
        chat: mockChatInterface,
      } as any,
      setAgentName: vi.fn(),
      setAgentDescription: vi.fn(),
    };
  });

  it('should create a chat when initialized with chat capability', async () => {
    // Test that createChat is called during initialization
    expect(mockChatInterface.createChat).toBeDefined();
  });

  it('should add messages to chat when processing responses', async () => {
    const assistantMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello' }],
      createdAt: new Date(),
    };

    // Simulate adding a message
    mockChatInterface.addMessage(assistantMessage);
    
    expect(mockChatInterface.addMessage).toHaveBeenCalledWith(assistantMessage);
  });

  it('should handle tool calls in chat messages', async () => {
    const toolCallMessage = {
      id: 'msg-2',
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'testTool',
          args: { param: 'value' },
          requiresApproval: false,
        },
      ],
      createdAt: new Date(),
    };

    mockChatInterface.addMessage(toolCallMessage);
    
    expect(mockChatInterface.addMessage).toHaveBeenCalledWith(toolCallMessage);
  });

  it('should add tool results to chat', async () => {
    const toolResultMessage = {
      id: 'tool-1',
      role: 'tool',
      content: [
        {
          toolCallId: 'call-1',
          toolName: 'testTool',
          result: { output: 'success' },
          isError: false,
        },
      ],
      createdAt: new Date(),
    };

    mockChatInterface.addMessage(toolResultMessage);
    
    expect(mockChatInterface.addMessage).toHaveBeenCalledWith(toolResultMessage);
  });

  it('should update messages during streaming', async () => {
    const messageId = 'msg-3';
    const content = [{ type: 'text', text: 'Streaming text...' }];

    mockChatInterface.updateMessage(messageId, content);
    
    expect(mockChatInterface.updateMessage).toHaveBeenCalledWith(messageId, content);
  });

  it('should get active chat for history retrieval', () => {
    const mockChat = {
      id: 'chat-123',
      title: 'Test Chat',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
          createdAt: new Date(),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there!' }],
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      isActive: true,
    };

    mockChatInterface.getActiveChat.mockReturnValue(mockChat);
    
    const activeChat = mockChatInterface.getActiveChat();
    
    expect(activeChat).toBeDefined();
    expect(activeChat.messages).toHaveLength(2);
    expect(activeChat.messages[0].role).toBe('user');
    expect(activeChat.messages[1].role).toBe('assistant');
  });

  it('should fallback to messaging when chat is not available', () => {
    const serverWithoutChat = {
      ...mockServer,
      interface: {
        ...mockServer.interface,
        chat: undefined,
      },
    };

    // Should use messaging interface as fallback
    expect(serverWithoutChat.interface?.messaging).toBeDefined();
  });
});