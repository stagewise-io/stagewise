import type { ChatImplementation } from '../../router/capabilities/chat';
import type {
  Chat,
  ChatListItem,
  ChatMessage,
  ChatUpdate,
  MessagePartUpdate,
  UserMessage,
  AssistantMessage,
  ToolMessage,
} from '../../router/capabilities/chat/types';
import { PushController } from './push-controller';

/**
 * ChatManager - Manages chat functionality
 *
 * This class handles the modern chat interface for agents, providing:
 * - Multi-chat management (with one active chat at a time)
 * - Message history within each chat
 * - Streaming message updates for real-time responses
 * - Tool integration within the chat context
 * - Chat persistence (placeholder for future implementation)
 *
 * The chat interface is the preferred way for new agents to handle conversations,
 * as it maintains full context and supports advanced features like parallel tool calls.
 */
export class ChatManager {
  /**
   * Map of all chats, keyed by chat ID
   * Each chat contains its own message history
   */
  private chats: Map<string, Chat> = new Map();

  /**
   * ID of the currently active chat
   * Only one chat can be active at a time
   */
  private activeChatId: string | null = null;

  /**
   * Map of pending tool approvals by toolCallId
   */
  private pendingToolApprovals: Map<
    string,
    { chatId: string; messageId: string }
  > = new Map();

  /**
   * Current agent working state
   */
  private isWorking = false;

  /**
   * Stop listeners
   */
  private stopListeners: Array<() => void> = [];

  /**
   * Set of listeners for chat update events
   * Used internally by the agent to react to chat changes
   */
  private chatUpdateListeners: Set<(update: ChatUpdate) => void> = new Set();

  /**
   * Controller for broadcasting chat updates to toolbar subscribers
   */
  private readonly controller: PushController<ChatUpdate>;

  /**
   * Function to generate unique IDs for chats and messages
   */
  private readonly idGenerator: () => string;

  constructor(idGenerator: () => string) {
    this.idGenerator = idGenerator;

    // Create controller without initial value
    // Initial state is sent on first subscription
    this.controller = new PushController();
  }

  /**
   * Gets a list of all chats with summary information
   *
   * @returns Array of chat list items with metadata
   * @throws Error if chat is not supported
   */
  public getChats(): ChatListItem[] {
    return Array.from(this.chats.values()).map((chat) => ({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      isActive: chat.id === this.activeChatId,
      messageCount: chat.messages.length,
    }));
  }

  /**
   * Gets the ID of the currently active chat
   *
   * @returns The active chat ID or null if no chat is active
   * @throws Error if chat is not supported
   */
  public getActiveChatId(): string | null {
    return this.activeChatId;
  }

  /**
   * Gets the currently active chat with full message history
   *
   * @returns The active chat or null if no chat is active
   * @throws Error if chat is not supported
   */
  public getActiveChat(): Chat | null {
    return this.activeChatId ? this.chats.get(this.activeChatId) || null : null;
  }

  /**
   * Creates a new chat and makes it active
   * Agents can create chats anytime, toolbar can only create when idle
   *
   * @param title - Optional title for the chat
   * @param isFromAgent - Whether this is being called by the agent (bypasses restrictions)
   * @returns The ID of the newly created chat
   * @throws Error if chat is not supported or toolbar tries to create while busy
   */
  public async createChat(
    title?: string,
    isFromAgent = false,
  ): Promise<string> {
    // Only enforce restrictions for toolbar-initiated creates
    if (!isFromAgent && this.activeChatId && this.isWorking) {
      throw new Error('Cannot create new chat while current chat is active');
    }

    // Generate new chat with metadata
    const chatId = this.idGenerator();
    const chat: Chat = {
      id: chatId,
      title: title || 'New chat',
      createdAt: new Date(),
      messages: [],
      isActive: true,
    };

    // Deactivate previous chat if exists
    if (this.activeChatId) {
      const previousChat = this.chats.get(this.activeChatId);
      if (previousChat) {
        previousChat.isActive = false;
      }
    }

    // Store and activate new chat
    this.chats.set(chatId, chat);
    this.activeChatId = chatId;

    // Broadcast chat creation event
    const update: ChatUpdate = {
      type: 'chat-created',
      chat,
    };
    this.broadcastUpdate(update);

    return chatId;
  }

  /**
   * Deletes a chat and its message history
   * Cannot delete the active chat while the agent is working
   *
   * @param chatId - ID of the chat to delete
   * @throws Error if chat is not supported or trying to delete active chat while busy
   */
  public async deleteChat(chatId: string): Promise<void> {
    // Prevent deleting active chat while agent is working
    if (chatId === this.activeChatId && this.isWorking) {
      throw new Error('Cannot delete active chat while not idle');
    }

    // Remove chat from storage
    this.chats.delete(chatId);

    // Clear active chat if it was deleted
    if (chatId === this.activeChatId) {
      this.activeChatId = null;
    }

    // Broadcast deletion event
    const update: ChatUpdate = {
      type: 'chat-deleted',
      chatId,
    };
    this.broadcastUpdate(update);
  }

  /**
   * Updates the title of a chat
   *
   * @param chatId - ID of the chat to update
   * @param title - New title for the chat
   * @throws Error if chat is not supported or chat not found
   */
  public async updateChatTitle(chatId: string, title: string): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) {
      throw new Error(`Chat ${chatId} not found`);
    }

    // Update the title
    chat.title = title;

    // Broadcast title update event
    const update: ChatUpdate = {
      type: 'chat-title-updated',
      chatId,
      title,
    };
    this.broadcastUpdate(update);
  }

  /**
   * Switches to a different chat
   * Can only switch when the agent is idle
   *
   * @param chatId - ID of the chat to switch to
   * @throws Error if chat not found or agent is busy
   */
  public async switchChat(chatId: string): Promise<void> {
    // Prevent switching while agent is working
    if (this.isWorking) {
      throw new Error('Cannot switch chats while not idle');
    }

    // Verify chat exists
    if (!this.chats.has(chatId)) {
      throw new Error('Chat not found');
    }

    // Deactivate current chat
    if (this.activeChatId) {
      const previousChat = this.chats.get(this.activeChatId);
      if (previousChat) {
        previousChat.isActive = false;
      }
    }

    // Activate new chat
    this.activeChatId = chatId;
    const chat = this.chats.get(chatId)!;
    chat.isActive = true;

    // Broadcast switch event
    const switchUpdate: ChatUpdate = {
      type: 'chat-switched',
      chatId,
    };
    this.broadcastUpdate(switchUpdate);

    // Send full chat sync for the newly active chat
    const syncUpdate: ChatUpdate = {
      type: 'chat-full-sync',
      chat,
    };
    this.broadcastUpdate(syncUpdate);
  }

  /**
   * Adds a message to a specific chat or the active chat
   * Used by agents to add assistant or tool messages
   *
   * @param message - The message to add (any role)
   * @param chatId - Optional chat ID (defaults to active chat)
   */
  public addMessage(message: ChatMessage, chatId?: string): void {
    const targetChatId = chatId || this.activeChatId;
    if (!targetChatId) {
      throw new Error('No chat ID provided and no active chat');
    }

    const chat = this.chats.get(targetChatId);
    if (!chat) {
      throw new Error(`Chat ${targetChatId} not found`);
    }

    // Add message to chat history
    chat.messages.push(message);

    // Track pending tool approvals if this is an assistant message with tool calls
    if (message.role === 'assistant') {
      const assistantMsg = message as AssistantMessage;
      assistantMsg.content.forEach((part) => {
        if (part.type === 'tool-call' && part.requiresApproval) {
          this.pendingToolApprovals.set(part.toolCallId, {
            chatId: targetChatId,
            messageId: message.id,
          });
        }
      });
    }

    // Broadcast message addition with chat ID
    const update: ChatUpdate = {
      type: 'message-added',
      chatId: targetChatId,
      message,
    };
    this.broadcastUpdate(update);
  }

  /**
   * Updates the content of an existing message
   * Used for streaming updates as the agent generates responses
   *
   * @param messageId - ID of the message to update
   * @param content - New content array for the message
   * @param chatId - Optional chat ID (defaults to active chat)
   */
  public updateMessage(
    messageId: string,
    content: AssistantMessage['content'],
    chatId?: string,
  ): void {
    const targetChatId = chatId || this.activeChatId;
    if (!targetChatId) {
      throw new Error('No chat ID provided and no active chat');
    }

    const chat = this.chats.get(targetChatId);
    if (!chat) {
      throw new Error(`Chat ${targetChatId} not found`);
    }

    // Find and update the message
    const message = chat.messages.find((m) => m.id === messageId);
    if (message && message.role === 'assistant') {
      (message as AssistantMessage).content = content;
    }
  }

  /**
   * Deletes a message from a specific chat
   *
   * @param messageId - ID of the message to delete
   * @param chatId - Optional chat ID (defaults to active chat)
   */
  public deleteMessage(messageId: string, chatId?: string): void {
    const targetChatId = chatId || this.activeChatId;
    if (!targetChatId) {
      throw new Error('No chat ID provided and no active chat');
    }

    const chat = this.chats.get(targetChatId);
    if (!chat) {
      throw new Error(`Chat ${targetChatId} not found`);
    }

    // Remove message from chat
    const index = chat.messages.findIndex((m) => m.id === messageId);
    if (index !== -1) {
      chat.messages.splice(index, 1);
    }
  }

  /**
   * Deletes a message and all subsequent messages from a specific chat
   * This is critical for maintaining consistency when users want to revise history
   *
   * @param messageId - ID of the message to delete from
   * @param chatId - Optional chat ID (defaults to active chat)
   */
  public deleteMessageAndSubsequent(messageId: string, chatId?: string): void {
    const targetChatId = chatId || this.activeChatId;
    if (!targetChatId) {
      throw new Error('No chat ID provided and no active chat');
    }

    const chat = this.chats.get(targetChatId);
    if (!chat) {
      throw new Error(`Chat ${targetChatId} not found`);
    }

    // Find the index of the message to delete from
    const index = chat.messages.findIndex((m) => m.id === messageId);
    if (index === -1) {
      throw new Error(`Message ${messageId} not found in chat ${targetChatId}`);
    }

    // Delete this message and all subsequent messages
    const deletedCount = chat.messages.length - index;
    chat.messages.splice(index);

    // Broadcast update about the deletion
    const update: ChatUpdate = {
      type: 'messages-deleted',
      chatId: targetChatId,
      fromMessageId: messageId,
      deletedCount,
    };
    this.broadcastUpdate(update);
  }

  /**
   * Clears all messages from a specific chat
   *
   * @param chatId - Optional chat ID (defaults to active chat)
   */
  public clearMessages(chatId?: string): void {
    const targetChatId = chatId || this.activeChatId;
    if (!targetChatId) {
      throw new Error('No chat ID provided and no active chat');
    }

    const chat = this.chats.get(targetChatId);
    if (!chat) {
      throw new Error(`Chat ${targetChatId} not found`);
    }

    // Clear message history
    chat.messages = [];
  }

  /**
   * Handles streaming updates for message parts
   * Used for real-time updates as the agent generates content
   *
   * @param messageId - ID of the message being updated
   * @param partIndex - Index of the part being updated
   * @param update - The update to apply
   * @param chatId - Optional chat ID (defaults to active chat)
   */
  public streamMessagePart(
    messageId: string,
    partIndex: number,
    update: {
      content: MessagePartUpdate['content'];
      updateType: MessagePartUpdate['updateType'];
    },
    chatId?: string,
  ): void {
    const targetChatId = chatId || this.activeChatId;
    if (!targetChatId) {
      throw new Error('No chat ID provided and no active chat');
    }

    // Broadcast streaming update with chat ID
    const chatUpdate: ChatUpdate = {
      type: 'message-updated',
      chatId: targetChatId,
      update: {
        messageId,
        partIndex,
        content: update.content,
        updateType: update.updateType,
      },
    };
    this.broadcastUpdate(chatUpdate);
  }

  /**
   * Adds a listener for chat update events
   * Used internally by the agent
   *
   * @param listener - Function to call on chat updates
   */
  public addUpdateListener(listener: (update: ChatUpdate) => void): void {
    this.chatUpdateListeners.add(listener);
  }

  /**
   * Removes a chat update listener
   *
   * @param listener - The listener to remove
   */
  public removeUpdateListener(listener: (update: ChatUpdate) => void): void {
    this.chatUpdateListeners.delete(listener);
  }

  /**
   * Clears all chat update listeners
   * Used during cleanup to prevent memory leaks
   */
  public clearAllUpdateListeners(): void {
    this.chatUpdateListeners.clear();
  }

  /**
   * Creates the implementation object for the router's chat capability
   * This is what the toolbar uses to interact with chat functionality
   *
   * @returns The chat implementation for the transport interface
   */
  public createImplementation(): ChatImplementation {
    const self = this;

    return {
      /**
       * Returns an AsyncIterable that yields chat updates
       * Sends initial state on first subscription
       */
      getChatUpdates: () => {
        const sub = self.controller.subscribe();
        const originalIterator = sub[Symbol.asyncIterator]();

        return {
          [Symbol.asyncIterator]: () => {
            let hasInitialized = false;

            return {
              next: async () => {
                // Send initial chat list on first call
                if (!hasInitialized) {
                  hasInitialized = true;

                  const chatListUpdate: ChatUpdate = {
                    type: 'chat-list',
                    chats: self.getChats(),
                  };

                  return { value: chatListUpdate, done: false };
                }

                // After initial sync, return updates from controller
                return originalIterator.next();
              },

              return: () => {
                return originalIterator.return
                  ? originalIterator.return()
                  : Promise.resolve({ value: undefined, done: true });
              },
            };
          },
        };
      },

      /**
       * Handles sending a message from the toolbar
       */
      onSendMessage: async (request) => {
        if (!self.activeChatId || self.activeChatId !== request.chatId) {
          throw new Error('Invalid chat ID or no active chat');
        }

        const chat = self.chats.get(request.chatId);
        if (!chat) {
          throw new Error('Chat not found');
        }

        // Create user message with metadata
        const messageId = self.idGenerator();
        const userMessage: UserMessage = {
          id: messageId,
          role: 'user',
          content: request.content,
          metadata: request.metadata,
          createdAt: new Date(),
        };

        // Add to chat and broadcast
        chat.messages.push(userMessage);

        const update: ChatUpdate = {
          type: 'message-added',
          chatId: request.chatId,
          message: userMessage,
        };
        self.broadcastUpdate(update);
      },

      /**
       * Creates a new chat from the toolbar
       * Enforces restrictions for toolbar-initiated creates
       */
      onCreateChat: async (request) => {
        // Pass isFromAgent=false to enforce toolbar restrictions
        return self.createChat(request.title, false);
      },

      /**
       * Deletes a chat from the toolbar
       */
      onDeleteChat: async (chatId) => {
        await self.deleteChat(chatId);
      },

      /**
       * Switches to a different chat from the toolbar
       */
      onSwitchChat: async (chatId) => {
        await self.switchChat(chatId);
      },

      /**
       * Updates the title of a chat from the toolbar
       */
      onUpdateChatTitle: async (request) => {
        await self.updateChatTitle(request.chatId, request.title);
      },

      /**
       * Deletes a message and all subsequent messages from the toolbar
       * Critical for maintaining consistency when users want to revise history
       */
      onDeleteMessageAndSubsequent: async (request) => {
        await self.deleteMessageAndSubsequent(
          request.messageId,
          request.chatId,
        );
      },

      /**
       * Handles tool approval responses from the toolbar
       */
      onToolApproval: async (response) => {
        // Find the pending tool call
        const pendingInfo = self.pendingToolApprovals.get(response.toolCallId);
        if (!pendingInfo) {
          throw new Error(
            `No pending approval for tool call ${response.toolCallId}`,
          );
        }

        const chat = self.chats.get(pendingInfo.chatId);
        if (!chat) {
          throw new Error('Chat not found for tool approval');
        }

        // Create a user message with the tool approval part
        const userMessage: UserMessage = {
          id: self.idGenerator(),
          role: 'user',
          content: [
            {
              type: 'tool-approval',
              toolCallId: response.toolCallId,
              approved: response.approved,
            },
          ],
          metadata: {
            sentByPlugin: false,
            pluginContentItems: {},
          },
          createdAt: new Date(),
        };

        // Add to chat and broadcast
        self.addMessage(userMessage, pendingInfo.chatId);

        // Clean up pending approval
        self.pendingToolApprovals.delete(response.toolCallId);
      },

      /**
       * Registers tools from the toolbar
       * Currently a no-op as tool metadata is not used
       */
      onToolRegistration: (_tools) => {
        // Tool registration is handled by the toolbar
        // The agent doesn't need to track available tools
      },

      /**
       * Reports tool execution results from the toolbar
       */
      onToolResult: (toolCallId, result, isError) => {
        if (!self.activeChatId) {
          console.error('No active chat for tool result');
          return;
        }

        const chat = self.chats.get(self.activeChatId);
        if (!chat) {
          console.error('Active chat not found');
          return;
        }

        // Find the tool call in recent messages to get the tool name
        let toolName = 'unknown';
        for (let i = chat.messages.length - 1; i >= 0; i--) {
          const msg = chat.messages[i];
          if (msg.role === 'assistant') {
            const assistantMsg = msg as AssistantMessage;
            const toolCall = assistantMsg.content.find(
              (part) =>
                part.type === 'tool-call' && part.toolCallId === toolCallId,
            );
            if (toolCall && toolCall.type === 'tool-call') {
              toolName = toolCall.toolName;
              break;
            }
          }
        }

        // Create a tool message with the result
        const toolMessage: ToolMessage = {
          id: self.idGenerator(),
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId,
              toolName,
              output: result,
              isError,
            },
          ],
          createdAt: new Date(),
        };

        // Add to chat and broadcast
        self.addMessage(toolMessage);
      },

      /**
       * Handles stop requests from the toolbar
       */
      onStop: async () => {
        if (!self.isWorking) {
          throw new Error('Agent is not currently working');
        }

        // Trigger all stop listeners
        for (const listener of self.stopListeners) {
          try {
            listener();
          } catch (error) {
            console.error('Error in stop listener:', error);
          }
        }
      },
    };
  }

  /**
   * Sets the agent's working state and broadcasts it
   */
  public setWorkingState(isWorking: boolean): void {
    this.isWorking = isWorking;

    const update: ChatUpdate = {
      type: 'agent-state',
      isWorking,
    };

    this.broadcastUpdate(update);
  }

  /**
   * Adds a stop listener
   */
  public addStopListener(listener: () => void): void {
    this.stopListeners.push(listener);
  }

  /**
   * Removes a stop listener
   */
  public removeStopListener(listener: () => void): void {
    const index = this.stopListeners.indexOf(listener);
    if (index !== -1) {
      this.stopListeners.splice(index, 1);
    }
  }

  /**
   * Clears all stop listeners
   */
  public clearAllStopListeners(): void {
    this.stopListeners = [];
  }

  /**
   * Broadcasts an update to all listeners and the controller
   *
   * @param update - The chat update to broadcast
   */
  private broadcastUpdate(update: ChatUpdate): void {
    // Send to controller for toolbar subscribers
    this.controller.push(update);

    // Notify internal listeners
    this.chatUpdateListeners.forEach((listener) => listener(update));
  }
}
