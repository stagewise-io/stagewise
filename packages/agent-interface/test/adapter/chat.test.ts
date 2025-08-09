import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentTransportAdapter } from '../../src/agent/adapter';
import { AgentStateType } from '../../src/router/capabilities/state/types';
import type { 
  ChatUpdate, 
  MessagePartUpdate, 
  UserMessage 
} from '../../src/router/capabilities/chat/types';

describe('AgentTransportAdapter - Chat Capability', () => {
  let adapter: AgentTransportAdapter;
  let agent: ReturnType<AgentTransportAdapter['getAgent']>;

  beforeEach(() => {
    adapter = new AgentTransportAdapter({
      idGenerator: () => 'test-id-' + Math.random().toString(36).substr(2, 9),
    });
    agent = adapter.getAgent();
  });

  describe('Chat Support', () => {
    it('should be disabled by default', () => {
      expect(agent.chat.isSupported()).toBe(false);
    });

    it('should throw when using chat methods while disabled', async () => {
      expect(() => agent.chat.getChats()).toThrow('Chat is not supported by this agent');
      expect(() => agent.chat.getActiveChat()).toThrow('Chat is not supported by this agent');
      await expect(agent.chat.createChat()).rejects.toThrow('Chat is not supported by this agent');
    });

    it('should enable chat support', () => {
      agent.chat.setChatSupport(true);
      expect(agent.chat.isSupported()).toBe(true);
      expect(adapter.chat).toBeDefined();
    });

    it('should disable chat support and clean up', () => {
      agent.chat.setChatSupport(true);
      agent.chat.setChatSupport(false);
      expect(agent.chat.isSupported()).toBe(false);
      expect(adapter.chat).toBeUndefined();
    });
  });

  describe('Chat Management', () => {
    beforeEach(() => {
      agent.chat.setChatSupport(true);
    });

    it('should create a new chat', async () => {
      const chatId = await agent.chat.createChat('Test Chat');
      expect(chatId).toMatch(/^test-id-/);
      
      const chats = agent.chat.getChats();
      expect(chats).toHaveLength(1);
      expect(chats[0].title).toBe('Test Chat');
      expect(chats[0].id).toBe(chatId);
      expect(chats[0].isActive).toBe(true);
    });

    it('should create chat with default title', async () => {
      const chatId = await agent.chat.createChat();
      const chats = agent.chat.getChats();
      expect(chats[0].title).toBe('New chat');
    });

    it('should get active chat', async () => {
      const chatId = await agent.chat.createChat('Active Chat');
      const activeChat = agent.chat.getActiveChat();
      
      expect(activeChat).toBeDefined();
      expect(activeChat?.id).toBe(chatId);
      expect(activeChat?.title).toBe('Active Chat');
      expect(activeChat?.isActive).toBe(true);
    });

    it('should delete a chat', async () => {
      const chatId = await agent.chat.createChat('To Delete');
      await agent.chat.deleteChat(chatId);
      
      const chats = agent.chat.getChats();
      expect(chats).toHaveLength(0);
      expect(agent.chat.getActiveChat()).toBeNull();
    });

    it('should not delete active chat while not idle', async () => {
      const chatId = await agent.chat.createChat('Active');
      agent.state.set(AgentStateType.PROCESSING);
      
      await expect(agent.chat.deleteChat(chatId)).rejects.toThrow(
        'Cannot delete active chat while not idle'
      );
    });

    it('should switch between chats', async () => {
      const chatId1 = await agent.chat.createChat('Chat 1');
      const chatId2 = await agent.chat.createChat('Chat 2');
      
      // Chat 2 should be active after creation
      expect(agent.chat.getActiveChat()?.id).toBe(chatId2);
      
      await agent.chat.switchChat(chatId1);
      expect(agent.chat.getActiveChat()?.id).toBe(chatId1);
      
      const chats = agent.chat.getChats();
      expect(chats.find(c => c.id === chatId1)?.isActive).toBe(true);
      expect(chats.find(c => c.id === chatId2)?.isActive).toBe(false);
    });

    it('should not switch chats while not idle', async () => {
      const chatId1 = await agent.chat.createChat('Chat 1');
      const chatId2 = await agent.chat.createChat('Chat 2');
      agent.state.set(AgentStateType.PROCESSING);
      
      await expect(agent.chat.switchChat(chatId1)).rejects.toThrow(
        'Cannot switch chats while not idle'
      );
    });

    it('should allow agent to create new chat even while working', async () => {
      await agent.chat.createChat('Active');
      agent.state.set(AgentStateType.PROCESSING);
      
      // Agent can create chats anytime (restriction only applies to toolbar)
      const newChatId = await agent.chat.createChat('New');
      expect(newChatId).toBeDefined();
    });
  });

  describe('Message Handling', () => {
    beforeEach(() => {
      agent.chat.setChatSupport(true);
    });

    it('should add a message to active chat', async () => {
      const chatId = await agent.chat.createChat('Message Test');
      const metadata = {
        currentUrl: 'https://example.com',
        currentTitle: 'Test Page',
        currentZoomLevel: 1,
        viewportResolution: { width: 1920, height: 1080 },
        devicePixelRatio: 1,
        userAgent: 'test-agent',
        locale: 'en-US',
        selectedElements: [],
      };
      
      // Add message directly (sendMessage was removed from agent interface)
      agent.chat.addMessage({
        id: 'user-msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Hello, world!' }],
        metadata,
        createdAt: new Date(),
      });
      
      const activeChat = agent.chat.getActiveChat();
      expect(activeChat?.messages).toHaveLength(1);
      expect(activeChat?.messages[0].role).toBe('user');
      expect(activeChat?.messages[0].content).toEqual([
        { type: 'text', text: 'Hello, world!' }
      ]);
    });

    it('should throw when adding message without chat ID and no active chat', async () => {
      // Disable and re-enable to clear chats  
      agent.chat.setChatSupport(false);
      agent.chat.setChatSupport(true);
      
      const mockMetadata: UserMessage['metadata'] = {
        currentUrl: null,
        currentTitle: null,
        currentZoomLevel: 1,
        viewportResolution: { width: 1920, height: 1080 },
        devicePixelRatio: 1,
        userAgent: 'test',
        locale: 'en',
        selectedElements: [],
      };
      
      // Trying to add message without chat ID and no active chat should throw
      expect(() => {
        agent.chat.addMessage({
          id: 'user-msg-1',
          role: 'user',
          content: [{ type: 'text', text: 'No chat' }],
          metadata: mockMetadata,
          createdAt: new Date(),
        });
      }).toThrow('No chat ID provided and no active chat');
    });
  });

  describe('Chat Updates', () => {
    beforeEach(() => {
      agent.chat.setChatSupport(true);
    });

    it('should notify listeners of chat updates', async () => {
      const updates: ChatUpdate[] = [];
      const listener = vi.fn((update) => updates.push(update));
      
      agent.chat.addChatUpdateListener(listener);
      
      const chatId = await agent.chat.createChat('Update Test');
      
      expect(listener).toHaveBeenCalled();
      expect(updates.some(u => u.type === 'chat-created')).toBe(true);
      
      agent.chat.removeChatUpdateListener(listener);
    });

    it('should stream message part updates', async () => {
      const listener = vi.fn();
      agent.chat.addChatUpdateListener(listener);
      
      // Create a chat first to have an active chat
      await agent.chat.createChat('Stream Test');
      
      const partUpdate: MessagePartUpdate = {
        messageId: 'msg-1',
        partIndex: 0,
        content: { type: 'text', text: 'Streaming...' },
        updateType: 'create',
      };
      agent.chat.streamMessagePart('msg-1', 0, partUpdate);
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message-updated',
          update: expect.objectContaining({
            messageId: 'msg-1',
            partIndex: 0,
          }),
        })
      );
    });
  });

  describe('Tool Integration', () => {
    beforeEach(async () => {
      agent.chat.setChatSupport(true);
      await agent.chat.createChat('Test Chat');
    });

    it('should handle tool registration from toolbar (no-op)', () => {
      const tools = [
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: { type: 'object' },
        },
      ];
      
      // Get the chat implementation to simulate toolbar registration
      const chatManager = (adapter as any).chatManager;
      const chatImpl = chatManager.createImplementation();
      
      // This should be a no-op since tool metadata is not used
      expect(() => {
        chatImpl.onToolRegistration(tools);
      }).not.toThrow();
    });

    it('should add tool result messages when reporting results', () => {
      const chatId = agent.chat.getActiveChat()?.id;
      expect(chatId).toBeDefined();
      
      // Add an assistant message with a tool call
      agent.chat.addMessage({
        id: 'msg-1',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me use a tool' },
          {
            type: 'tool-call',
            toolCallId: 'tool-1',
            toolName: 'test-tool',
            input: { param: 'value' },
            runtime: 'toolbar',
            requiresApproval: false,
          },
        ],
        createdAt: new Date(),
      });
      
      // Report tool result through chat implementation (as toolbar would)
      const chatManager = (adapter as any).chatManager;
      const chatImpl = chatManager.createImplementation();
      chatImpl.onToolResult('tool-1', { result: 'success' }, false);
      
      // Check that a tool message was added
      const chat = agent.chat.getActiveChat();
      expect(chat?.messages).toHaveLength(2);
      const toolMessage = chat?.messages[1];
      expect(toolMessage?.role).toBe('tool');
      expect(toolMessage?.content[0]).toMatchObject({
        type: 'tool-result',
        toolCallId: 'tool-1',
        toolName: 'test-tool',
        output: { result: 'success' },
        isError: false,
      });
    });

    it('should track and handle tool approvals', async () => {
      // Add an assistant message with a tool call requiring approval
      agent.chat.addMessage({
        id: 'msg-1',
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tool-2',
            toolName: 'dangerous-tool',
            input: { action: 'delete' },
            runtime: 'cli',
            requiresApproval: true,
          },
        ],
        createdAt: new Date(),
      });
      
      // Simulate approval through the chat implementation (as toolbar would)
      const chatManager = (adapter as any).chatManager;
      const chatImpl = chatManager.createImplementation();
      await chatImpl.onToolApproval({
        toolCallId: 'tool-2',
        approved: true,
      });
      
      // Check that approval message was added as a UserMessage
      const chat = agent.chat.getActiveChat();
      expect(chat?.messages).toHaveLength(2);
      const approvalMessage = chat?.messages[1];
      expect(approvalMessage?.role).toBe('user');
      expect(approvalMessage?.content[0]).toMatchObject({
        type: 'tool-approval',
        toolCallId: 'tool-2',
        approved: true,
      });
      // Check metadata indicates this is a tool approval
      expect(approvalMessage?.metadata?.isToolApproval).toBe(true);
    });

    it('should handle tool rejection', async () => {
      // Add an assistant message with a tool call requiring approval
      agent.chat.addMessage({
        id: 'msg-1',
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tool-3',
            toolName: 'dangerous-tool',
            input: { action: 'delete' },
            runtime: 'cli',
            requiresApproval: true,
          },
        ],
        createdAt: new Date(),
      });
      
      // Simulate rejection through the chat implementation (as toolbar would)
      const chatManager = (adapter as any).chatManager;
      const chatImpl = chatManager.createImplementation();
      await chatImpl.onToolApproval({
        toolCallId: 'tool-3',
        approved: false,
      });
      
      // Check that rejection message was added as a UserMessage
      const chat = agent.chat.getActiveChat();
      expect(chat?.messages).toHaveLength(2);
      const rejectionMessage = chat?.messages[1];
      expect(rejectionMessage?.role).toBe('user');
      expect(rejectionMessage?.content[0]).toMatchObject({
        type: 'tool-approval',
        toolCallId: 'tool-3',
        approved: false,
      });
      // Check metadata indicates this is a tool approval
      expect(rejectionMessage?.metadata?.isToolApproval).toBe(true);
    });

    it('should throw error for non-existent tool approval', async () => {
      const chatManager = (adapter as any).chatManager;
      const chatImpl = chatManager.createImplementation();
      await expect(
        chatImpl.onToolApproval({
          toolCallId: 'non-existent',
          approved: true,
        })
      ).rejects.toThrow('No pending approval for tool call non-existent');
    });
  });


  describe('ChatImplementation Interface', () => {
    beforeEach(() => {
      agent.chat.setChatSupport(true);
    });

    it('should provide chat updates subscription', async () => {
      const implementation = adapter.chat!;
      const updates = implementation.getChatUpdates();
      const iterator = updates[Symbol.asyncIterator]();
      
      // First update should be chat list
      const firstUpdate = await iterator.next();
      expect(firstUpdate.value.type).toBe('chat-list');
      expect(firstUpdate.value.chats).toEqual([]);
      
      // Create a chat and check for update
      await agent.chat.createChat('Test');
      
      // Clean up
      await iterator.return?.();
    });

    it('should handle onSendMessage', async () => {
      const implementation = adapter.chat!;
      const chatId = await agent.chat.createChat('Test');
      
      await implementation.onSendMessage({
        chatId,
        content: [{ type: 'text', text: 'Test message' }],
        metadata: {
          currentUrl: null,
          currentTitle: null,
          currentZoomLevel: 1,
          viewportResolution: { width: 1920, height: 1080 },
          devicePixelRatio: 1,
          userAgent: 'test',
          locale: 'en',
          selectedElements: [],
        },
      });
      
      const chat = agent.chat.getActiveChat();
      expect(chat?.messages).toHaveLength(1);
    });
  });

  describe('Delete Message and Subsequent', () => {
    beforeEach(async () => {
      agent.chat.setChatSupport(true);
      await agent.chat.createChat('Test Chat');
    });

    it('should delete a message and all subsequent messages from active chat', async () => {
      const chatId = agent.chat.getActiveChatId();
      expect(chatId).toBeDefined();

      // Add multiple messages
      agent.chat.addMessage({
        id: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'First message' }],
        metadata: {
          currentUrl: null,
          currentTitle: null,
          currentZoomLevel: 1,
          viewportResolution: { width: 1920, height: 1080 },
          devicePixelRatio: 1,
          userAgent: 'test',
          locale: 'en',
          selectedElements: [],
        },
        createdAt: new Date(),
      });

      agent.chat.addMessage({
        id: 'msg-2',
        role: 'assistant',
        content: [{ type: 'text', text: 'Second message' }],
        createdAt: new Date(),
      });

      agent.chat.addMessage({
        id: 'msg-3',
        role: 'user',
        content: [{ type: 'text', text: 'Third message' }],
        metadata: {
          currentUrl: null,
          currentTitle: null,
          currentZoomLevel: 1,
          viewportResolution: { width: 1920, height: 1080 },
          devicePixelRatio: 1,
          userAgent: 'test',
          locale: 'en',
          selectedElements: [],
        },
        createdAt: new Date(),
      });

      agent.chat.addMessage({
        id: 'msg-4',
        role: 'assistant',
        content: [{ type: 'text', text: 'Fourth message' }],
        createdAt: new Date(),
      });

      // Verify all messages are present
      let chat = agent.chat.getActiveChat();
      expect(chat?.messages).toHaveLength(4);

      // Delete from message 2 onwards
      agent.chat.deleteMessageAndSubsequent('msg-2');

      // Verify only first message remains
      chat = agent.chat.getActiveChat();
      expect(chat?.messages).toHaveLength(1);
      expect(chat?.messages[0].id).toBe('msg-1');
      expect(chat?.messages[0].content[0]).toEqual({ type: 'text', text: 'First message' });
    });

    it('should delete all messages when deleting from first message', async () => {
      // Add multiple messages
      agent.chat.addMessage({
        id: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'First message' }],
        metadata: {
          currentUrl: null,
          currentTitle: null,
          currentZoomLevel: 1,
          viewportResolution: { width: 1920, height: 1080 },
          devicePixelRatio: 1,
          userAgent: 'test',
          locale: 'en',
          selectedElements: [],
        },
        createdAt: new Date(),
      });

      agent.chat.addMessage({
        id: 'msg-2',
        role: 'assistant',
        content: [{ type: 'text', text: 'Second message' }],
        createdAt: new Date(),
      });

      // Delete from first message
      agent.chat.deleteMessageAndSubsequent('msg-1');

      // Verify all messages are deleted
      const chat = agent.chat.getActiveChat();
      expect(chat?.messages).toHaveLength(0);
    });

    it('should delete messages from specific chat', async () => {
      const chatId1 = agent.chat.getActiveChatId();
      
      // Add messages to first chat
      agent.chat.addMessage({
        id: 'chat1-msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Chat 1 Message 1' }],
        metadata: {
          currentUrl: null,
          currentTitle: null,
          currentZoomLevel: 1,
          viewportResolution: { width: 1920, height: 1080 },
          devicePixelRatio: 1,
          userAgent: 'test',
          locale: 'en',
          selectedElements: [],
        },
        createdAt: new Date(),
      }, chatId1);

      agent.chat.addMessage({
        id: 'chat1-msg-2',
        role: 'assistant',
        content: [{ type: 'text', text: 'Chat 1 Message 2' }],
        createdAt: new Date(),
      }, chatId1);

      // Create second chat
      const chatId2 = await agent.chat.createChat('Chat 2');
      
      // Add messages to second chat
      agent.chat.addMessage({
        id: 'chat2-msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Chat 2 Message 1' }],
        metadata: {
          currentUrl: null,
          currentTitle: null,
          currentZoomLevel: 1,
          viewportResolution: { width: 1920, height: 1080 },
          devicePixelRatio: 1,
          userAgent: 'test',
          locale: 'en',
          selectedElements: [],
        },
        createdAt: new Date(),
      }, chatId2);

      agent.chat.addMessage({
        id: 'chat2-msg-2',
        role: 'assistant',
        content: [{ type: 'text', text: 'Chat 2 Message 2' }],
        createdAt: new Date(),
      }, chatId2);

      // Delete from chat1-msg-2 in first chat (not active)
      agent.chat.deleteMessageAndSubsequent('chat1-msg-2', chatId1);

      // Switch back to first chat to verify
      await agent.chat.switchChat(chatId1!);
      const chat1 = agent.chat.getActiveChat();
      expect(chat1?.messages).toHaveLength(1);
      expect(chat1?.messages[0].id).toBe('chat1-msg-1');

      // Verify second chat is unchanged
      await agent.chat.switchChat(chatId2);
      const chat2 = agent.chat.getActiveChat();
      expect(chat2?.messages).toHaveLength(2);
    });

    it('should broadcast messages-deleted update', async () => {
      const listener = vi.fn();
      agent.chat.addChatUpdateListener(listener);

      // Add messages
      agent.chat.addMessage({
        id: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Message 1' }],
        metadata: {
          currentUrl: null,
          currentTitle: null,
          currentZoomLevel: 1,
          viewportResolution: { width: 1920, height: 1080 },
          devicePixelRatio: 1,
          userAgent: 'test',
          locale: 'en',
          selectedElements: [],
        },
        createdAt: new Date(),
      });

      agent.chat.addMessage({
        id: 'msg-2',
        role: 'assistant',
        content: [{ type: 'text', text: 'Message 2' }],
        createdAt: new Date(),
      });

      agent.chat.addMessage({
        id: 'msg-3',
        role: 'user',
        content: [{ type: 'text', text: 'Message 3' }],
        metadata: {
          currentUrl: null,
          currentTitle: null,
          currentZoomLevel: 1,
          viewportResolution: { width: 1920, height: 1080 },
          devicePixelRatio: 1,
          userAgent: 'test',
          locale: 'en',
          selectedElements: [],
        },
        createdAt: new Date(),
      });

      // Clear previous calls to focus on delete event
      listener.mockClear();

      // Delete from msg-2
      agent.chat.deleteMessageAndSubsequent('msg-2');

      // Verify the messages-deleted update was broadcast
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'messages-deleted',
          chatId: agent.chat.getActiveChatId(),
          fromMessageId: 'msg-2',
          deletedCount: 2, // msg-2 and msg-3
        })
      );
    });

    it('should throw error when message not found', () => {
      expect(() => {
        agent.chat.deleteMessageAndSubsequent('non-existent');
      }).toThrow('Message non-existent not found in chat');
    });

    it('should throw error when no chat ID and no active chat', () => {
      // Clear active chat
      agent.chat.setChatSupport(false);
      agent.chat.setChatSupport(true);

      expect(() => {
        agent.chat.deleteMessageAndSubsequent('msg-1');
      }).toThrow('No chat ID provided and no active chat');
    });

    it('should handle deletion through router endpoint', async () => {
      const implementation = adapter.chat!;
      const chatId = agent.chat.getActiveChatId()!;

      // Add messages
      agent.chat.addMessage({
        id: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Message 1' }],
        metadata: {
          currentUrl: null,
          currentTitle: null,
          currentZoomLevel: 1,
          viewportResolution: { width: 1920, height: 1080 },
          devicePixelRatio: 1,
          userAgent: 'test',
          locale: 'en',
          selectedElements: [],
        },
        createdAt: new Date(),
      });

      agent.chat.addMessage({
        id: 'msg-2',
        role: 'assistant',
        content: [{ type: 'text', text: 'Message 2' }],
        createdAt: new Date(),
      });

      agent.chat.addMessage({
        id: 'msg-3',
        role: 'user',
        content: [{ type: 'text', text: 'Message 3' }],
        metadata: {
          currentUrl: null,
          currentTitle: null,
          currentZoomLevel: 1,
          viewportResolution: { width: 1920, height: 1080 },
          devicePixelRatio: 1,
          userAgent: 'test',
          locale: 'en',
          selectedElements: [],
        },
        createdAt: new Date(),
      });

      // Delete through router endpoint (as toolbar would)
      await implementation.onDeleteMessageAndSubsequent({
        chatId,
        messageId: 'msg-2',
      });

      // Verify deletion
      const chat = agent.chat.getActiveChat();
      expect(chat?.messages).toHaveLength(1);
      expect(chat?.messages[0].id).toBe('msg-1');
    });

    it('should handle deletion of last message', async () => {
      // Add messages
      agent.chat.addMessage({
        id: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Message 1' }],
        metadata: {
          currentUrl: null,
          currentTitle: null,
          currentZoomLevel: 1,
          viewportResolution: { width: 1920, height: 1080 },
          devicePixelRatio: 1,
          userAgent: 'test',
          locale: 'en',
          selectedElements: [],
        },
        createdAt: new Date(),
      });

      agent.chat.addMessage({
        id: 'msg-2',
        role: 'assistant',
        content: [{ type: 'text', text: 'Message 2' }],
        createdAt: new Date(),
      });

      // Delete only the last message
      agent.chat.deleteMessageAndSubsequent('msg-2');

      // Verify only first message remains
      const chat = agent.chat.getActiveChat();
      expect(chat?.messages).toHaveLength(1);
      expect(chat?.messages[0].id).toBe('msg-1');
    });
  });

  describe('Cleanup', () => {
    it('should clear all listeners', async () => {
      agent.chat.setChatSupport(true);
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      
      agent.chat.addChatUpdateListener(listener1);
      agent.messaging.addUserMessageListener(listener2);
      
      // Create a chat to enable streaming
      await agent.chat.createChat('Cleanup Test');
      
      // Reset the mock since it was called during chat creation
      listener1.mockClear();
      
      agent.cleanup.clearAllListeners();
      
      // Trigger updates to verify listeners were removed
      const emptyUpdate: MessagePartUpdate = {
        messageId: 'msg-1',
        partIndex: 0,
        content: { type: 'text', text: '' },
        updateType: 'create',
      };
      agent.chat.streamMessagePart('msg-1', 0, emptyUpdate);
      expect(listener1).not.toHaveBeenCalled();
    });
  });
});