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

    it('should not create new chat while current is active', async () => {
      await agent.chat.createChat('Active');
      agent.state.set(AgentStateType.PROCESSING);
      
      await expect(agent.chat.createChat('New')).rejects.toThrow(
        'Cannot create new chat while current chat is active'
      );
    });
  });

  describe('Message Handling', () => {
    beforeEach(() => {
      agent.chat.setChatSupport(true);
    });

    it('should send a message to active chat', async () => {
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
      
      await agent.chat.sendMessage(
        [{ type: 'text', text: 'Hello, world!' }],
        metadata
      );
      
      const activeChat = agent.chat.getActiveChat();
      expect(activeChat?.messages).toHaveLength(1);
      expect(activeChat?.messages[0].role).toBe('user');
      expect(activeChat?.messages[0].content).toEqual([
        { type: 'text', text: 'Hello, world!' }
      ]);
    });

    it('should throw when sending message without active chat', async () => {
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
      await expect(
        agent.chat.sendMessage(
          [{ type: 'text', text: 'No chat' }],
          mockMetadata
        )
      ).rejects.toThrow('No active chat');
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

    it('should register and retrieve tools', () => {
      const tools = [
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: { type: 'object' },
        },
      ];
      
      agent.chat.registerTools(tools);
      
      // Access the ChatManager through the adapter
      const chatManager = (adapter as any).chatManager;
      const registeredTools = chatManager.getAvailableTools();
      expect(registeredTools).toEqual(tools);
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
      
      // Report tool result
      agent.chat.reportToolResult('tool-1', { result: 'success' }, false);
      
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
      
      // Approve the tool call
      await agent.chat.handleToolApproval({
        toolCallId: 'tool-2',
        approved: true,
        modifiedInput: { action: 'delete', confirmed: true },
      });
      
      // Check that approval message was added
      const chat = agent.chat.getActiveChat();
      expect(chat?.messages).toHaveLength(2);
      const approvalMessage = chat?.messages[1];
      expect(approvalMessage?.role).toBe('tool');
      expect(approvalMessage?.content[0]).toMatchObject({
        type: 'tool-result',
        toolCallId: 'tool-2',
        toolName: 'approval',
        output: {
          status: 'approved',
          modifiedInput: { action: 'delete', confirmed: true },
        },
        isError: false,
      });
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
      
      // Reject the tool call
      await agent.chat.handleToolApproval({
        toolCallId: 'tool-3',
        approved: false,
      });
      
      // Check that rejection message was added
      const chat = agent.chat.getActiveChat();
      expect(chat?.messages).toHaveLength(2);
      const rejectionMessage = chat?.messages[1];
      expect(rejectionMessage?.role).toBe('tool');
      expect(rejectionMessage?.content[0]).toMatchObject({
        type: 'tool-result',
        toolCallId: 'tool-3',
        toolName: 'approval',
        output: { status: 'rejected' },
        isError: true,
      });
    });

    it('should throw error for non-existent tool approval', async () => {
      await expect(
        agent.chat.handleToolApproval({
          toolCallId: 'non-existent',
          approved: true,
        })
      ).rejects.toThrow('No pending approval for tool call non-existent');
    });
  });

  describe('Persistence Placeholders', () => {
    beforeEach(() => {
      agent.chat.setChatSupport(true);
    });

    it('should have loadChatHistory placeholder', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      await agent.chat.loadChatHistory();
      expect(consoleSpy).toHaveBeenCalledWith('loadChatHistory: Not implemented yet');
    });

    it('should have saveChatHistory placeholder', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      await agent.chat.saveChatHistory();
      expect(consoleSpy).toHaveBeenCalledWith('saveChatHistory: Not implemented yet');
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