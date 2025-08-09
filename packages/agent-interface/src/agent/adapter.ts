/**
 * AgentTransportAdapter - Main adapter for agent-toolbar communication
 *
 * This is the primary class that agent implementations use to communicate with
 * the Stagewise toolbar. It provides a unified interface that bridges between
 * the agent's implementation and the toolbar's expectations.
 *
 * The adapter is composed of several managers, each handling a specific aspect:
 * - AvailabilityManager: Tracks whether the agent is available
 * - StateManager: Tracks what the agent is currently doing
 * - MessagingManager: Handles the legacy messaging interface
 * - ChatManager: Handles the modern chat interface with full context
 *
 * Usage:
 * ```typescript
 * const adapter = new AgentTransportAdapter();
 * const agent = adapter.getAgent();
 * ```
 */

import type { TransportInterface } from '../router';
import type { AgentInterface } from './interface';
import type { ChatImplementation } from '../router/capabilities/chat';

// Import the split manager classes
import { ChatManager } from './adapter/chat-manager';

// Re-export PushController for backward compatibility if needed
export { PushController } from './adapter/push-controller';

/**
 * Optional configuration for the AgentTransportAdapter
 */
export interface AdapterOptions {
  /**
   * Custom function to generate unique IDs
   * Defaults to crypto.randomUUID() if not provided
   */
  idGenerator?: () => string;
}

/**
 * Main adapter class that composes all the managers and provides
 * the unified interface for agent-toolbar communication
 */
export class AgentTransportAdapter implements TransportInterface {
  /**
   * Public TransportInterface implementation
   * These are used by the router to expose capabilities to the toolbar
   */
  public readonly chat: ChatImplementation;

  /**
   * Internal manager instances that handle specific functionality
   */
  private readonly chatManager: ChatManager;

  /**
   * Cached AgentInterface instance to ensure stability
   */
  private _agentInterface: AgentInterface | null = null;

  /**
   * Configuration options with defaults applied
   */
  private readonly options: Required<AdapterOptions>;

  constructor(options?: AdapterOptions) {
    // Apply default options
    this.options = {
      idGenerator: options?.idGenerator ?? (() => crypto.randomUUID()),
    };

    // Initialize all managers
    // Each manager handles a specific aspect of agent functionality
    this.chatManager = new ChatManager(this.options.idGenerator);

    this.chat = this.chatManager.createImplementation();
  }

  /**
   * Gets the AgentInterface instance for the agent to use
   * This is the primary entry point for agents to interact with the adapter
   *
   * The interface is memoized to ensure stability - the same instance
   * is returned on every call to prevent issues with reference equality
   *
   * @returns The agent interface for controlling the adapter
   */
  public getAgent(): AgentInterface {
    if (this._agentInterface) {
      return this._agentInterface;
    }

    // Create and cache the interface
    this._agentInterface = this.createAgentInterface();
    return this._agentInterface;
  }

  /**
   * Creates the AgentInterface implementation that agents use
   * This interface provides all the methods agents need to:
   * - Set their availability status
   * - Update their current state
   * - Send and receive messages
   * - Manage chat sessions (if enabled)
   *
   * @returns A complete AgentInterface implementation
   */
  private createAgentInterface(): AgentInterface {
    const self = this; // Capture 'this' for use in the interface object

    return {
      /**
       * Chat interface (modern)
       * Provides methods for agents that use the chat system
       * This is the preferred interface for new agents
       */
      chat: {
        /**
         * Gets list of all chats
         */
        getChats: () => self.chatManager.getChats(),

        /**
         * Gets the ID of the currently active chat
         */
        getActiveChatId: () => self.chatManager.getActiveChatId(),

        /**
         * Gets the active chat with full message history
         */
        getActiveChat: () => self.chatManager.getActiveChat(),

        /**
         * Creates a new chat (agent can create anytime)
         */
        createChat: async (title) => self.chatManager.createChat(title, true),

        /**
         * Deletes a chat
         */
        deleteChat: async (chatId) => {
          await self.chatManager.deleteChat(chatId);
        },

        /**
         * Switches to a different chat
         */
        switchChat: async (chatId) => {
          await self.chatManager.switchChat(chatId);
        },

        /**
         * Updates the title of a chat
         */
        updateChatTitle: async (chatId, title) => {
          await self.chatManager.updateChatTitle(chatId, title);
        },

        /**
         * Adds a message to any chat
         * Used by agents to add their responses
         */
        addMessage: (message, chatId) => {
          self.chatManager.addMessage(message, chatId);
        },

        /**
         * Updates an existing message in any chat
         * Used for streaming updates
         */
        updateMessage: (messageId, content, chatId) => {
          self.chatManager.updateMessage(messageId, content, chatId);
        },

        /**
         * Deletes a message from any chat
         */
        deleteMessage: (messageId, chatId) => {
          self.chatManager.deleteMessage(messageId, chatId);
        },

        /**
         * Deletes a message and all subsequent messages
         * Critical for maintaining consistency when revising history
         */
        deleteMessageAndSubsequent: (messageId, chatId) => {
          self.chatManager.deleteMessageAndSubsequent(messageId, chatId);
        },

        /**
         * Clears all messages from a specific chat
         */
        clearMessages: (chatId) => {
          self.chatManager.clearMessages(chatId);
        },

        /**
         * Streams updates for a message part
         */
        streamMessagePart: (messageId, partIndex, update, chatId) => {
          self.chatManager.streamMessagePart(
            messageId,
            partIndex,
            update,
            chatId,
          );
        },

        /**
         * Adds a listener for chat updates
         * The agent uses this to listen for user messages and tool approvals
         */
        addChatUpdateListener: (listener) => {
          self.chatManager.addUpdateListener(listener);
        },

        /**
         * Removes a chat update listener
         */
        removeChatUpdateListener: (listener) => {
          self.chatManager.removeUpdateListener(listener);
        },

        /**
         * Sets the agent's working state
         */
        setWorkingState: (isWorking, description) => {
          self.chatManager.setWorkingState(isWorking, description);
        },

        /**
         * Adds a listener for stop signals
         */
        addStopListener: (listener) => {
          self.chatManager.addStopListener(listener);
        },

        /**
         * Removes a stop listener
         */
        removeStopListener: (listener) => {
          self.chatManager.removeStopListener(listener);
        },
      },

      /**
       * Cleanup utilities
       * Provides methods to clean up resources
       */
      cleanup: {
        /**
         * Removes all listeners to prevent memory leaks
         */
        clearAllListeners: () => {
          self.chatManager.clearAllUpdateListeners();
          self.chatManager.clearAllStopListeners();
        },
      },
    };
  }
}
