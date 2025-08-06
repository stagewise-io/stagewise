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
 * 
 * // Set availability
 * agent.availability.set(true);
 * 
 * // Set state
 * agent.state.set(AgentStateType.WORKING, 'Processing request...');
 * 
 * // Enable chat
 * agent.chat.setChatSupport(true);
 * ```
 */

import type { TransportInterface } from '../router';
import type { AgentInterface } from './interface';
import type { AvailabilityImplementation } from '../router/capabilities/availability';
import type { MessagingImplementation } from '../router/capabilities/messaging';
import type { StateImplementation } from '../router/capabilities/state';
import type { ChatImplementation } from '../router/capabilities/chat';
import { AgentAvailabilityError } from '../router/capabilities/availability/types';
import { AgentStateType } from '../router/capabilities/state/types';

// Import the split manager classes
import { AvailabilityManager } from './adapter/availability-manager';
import { StateManager } from './adapter/state-manager';
import { MessagingManager } from './adapter/messaging-manager';
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
  public readonly availability: AvailabilityImplementation;
  public readonly messaging: MessagingImplementation;
  public readonly state: StateImplementation;
  public chat?: ChatImplementation;

  /**
   * Internal manager instances that handle specific functionality
   */
  private readonly availabilityManager: AvailabilityManager;
  private readonly stateManager: StateManager;
  private readonly messagingManager: MessagingManager;
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
    this.availabilityManager = new AvailabilityManager();
    this.stateManager = new StateManager();
    this.messagingManager = new MessagingManager(this.options.idGenerator);
    this.chatManager = new ChatManager(this.options.idGenerator, this.stateManager);

    // Create the public TransportInterface implementations
    // These are what the router exposes to the toolbar
    this.availability = this.availabilityManager.createImplementation();
    this.state = this.stateManager.createImplementation();
    this.messaging = this.messagingManager.createImplementation();
    
    // Chat is optional and created on demand when enabled
    // This maintains backward compatibility with agents that don't use chat
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
       * Availability management interface
       * Allows the agent to indicate whether it's available and any errors
       */
      availability: {
        /**
         * Gets the current availability state
         * Returns a copy to prevent external modifications
         */
        get: () => self.availabilityManager.get(),
        
        /**
         * Sets the availability state
         * @param available - Whether the agent is available
         * @param error - Error type if unavailable
         * @param errorMessage - Human-readable error description
         */
        set: (available, error?, errorMessage?) => {
          if (available) {
            self.availabilityManager.set(true);
          } else {
            self.availabilityManager.set(false, error, errorMessage);
          }
        },
      },

      /**
       * State management interface
       * Allows the agent to indicate what it's currently doing
       */
      state: {
        /**
         * Gets the current state
         * Returns a copy to prevent external modifications
         */
        get: () => self.stateManager.get(),
        
        /**
         * Sets the current state
         * @param state - The state type (IDLE, WORKING, etc.)
         * @param description - Optional description of the current activity
         */
        set: (state, description) => {
          self.stateManager.set(state, description);
        },
      },

      /**
       * Messaging interface (legacy)
       * Provides methods for agents that use the older messaging system
       * New agents should use the chat interface instead
       */
      messaging: {
        /**
         * Gets the current message content
         */
        get: () => self.messagingManager.get(),
        
        /**
         * Gets the ID of the current message
         */
        getCurrentId: () => self.messagingManager.getCurrentId(),
        
        /**
         * Gets the complete current message with ID and parts
         */
        getCurrentMessage: () => self.messagingManager.getCurrentMessage(),
        
        /**
         * Adds a listener for incoming user messages
         */
        addUserMessageListener: (listener) => {
          self.messagingManager.addUserMessageListener(listener);
        },
        
        /**
         * Removes a user message listener
         */
        removeUserMessageListener: (listener) => {
          self.messagingManager.removeUserMessageListener(listener);
        },
        
        /**
         * Removes all user message listeners
         */
        clearUserMessageListeners: () => {
          self.messagingManager.clearUserMessageListeners();
        },
        
        /**
         * Clears the current message and starts a new one
         */
        clear: () => {
          self.messagingManager.clear();
        },
        
        /**
         * Sets the complete message content
         */
        set: (content) => {
          self.messagingManager.set(content);
        },
        
        /**
         * Adds parts to the current message
         */
        addPart: (content) => {
          self.messagingManager.addPart(content);
        },
        
        /**
         * Updates a specific part of the message
         */
        updatePart: (content, index, type) => {
          self.messagingManager.updatePart(content, index, type);
        },
      },

      /**
       * Chat interface (modern)
       * Provides methods for agents that use the chat system
       * This is the preferred interface for new agents
       */
      chat: {
        /**
         * Enables or disables chat support
         * When enabled, creates the chat implementation for the router
         */
        setChatSupport: (supported) => {
          self.chatManager.setSupport(supported);
          
          if (supported) {
            // Create the chat implementation for the router
            self.chat = self.chatManager.createImplementation();
          } else {
            // Remove chat implementation when disabled
            self.chat = undefined;
          }
        },
        
        /**
         * Checks if chat is supported
         */
        isSupported: () => self.chatManager.isSupported(),
        
        /**
         * Gets list of all chats
         */
        getChats: () => self.chatManager.getChats(),
        
        /**
         * Gets the active chat with full message history
         */
        getActiveChat: () => self.chatManager.getActiveChat(),
        
        /**
         * Creates a new chat
         */
        createChat: async (title) => self.chatManager.createChat(title),
        
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
         * Adds a message to the active chat
         * Used by agents to add their responses
         */
        addMessage: (message) => {
          self.chatManager.addMessage(message);
        },
        
        /**
         * Updates an existing message
         * Used for streaming updates
         */
        updateMessage: (messageId, content) => {
          self.chatManager.updateMessage(messageId, content);
        },
        
        /**
         * Deletes a message from the chat
         */
        deleteMessage: (messageId) => {
          self.chatManager.deleteMessage(messageId);
        },
        
        /**
         * Clears all messages from the active chat
         */
        clearMessages: () => {
          self.chatManager.clearMessages();
        },
        
        /**
         * Sends a user message (for testing or internal use)
         */
        sendMessage: async (content, metadata) => {
          if (!self.chatManager.isSupported()) {
            throw new Error('Chat is not supported by this agent.');
          }
          
          const activeChat = self.chatManager.getActiveChat();
          if (!activeChat) {
            throw new Error('No active chat');
          }
          
          // Create and add the user message
          const messageId = self.options.idGenerator();
          const userMessage = {
            id: messageId,
            role: 'user' as const,
            content,
            metadata,
            createdAt: new Date(),
          };
          
          self.chatManager.addMessage(userMessage);
        },
        
        /**
         * Streams updates for a message part
         */
        streamMessagePart: (messageId, partIndex, update) => {
          self.chatManager.streamMessagePart(messageId, partIndex, update);
        },
        
        /**
         * Handles tool approval responses
         */
        handleToolApproval: async (response) => {
          if (!self.chatManager.isSupported()) {
            throw new Error('Chat is not supported by this agent.');
          }
          // Call the implementation's onToolApproval method
          const implementation = self.chatManager.createImplementation();
          await implementation.onToolApproval(response);
        },
        
        /**
         * Registers available tools
         */
        registerTools: (tools) => {
          self.chatManager.registerTools(tools);
        },
        
        /**
         * Reports tool execution results
         */
        reportToolResult: (toolCallId, result, isError) => {
          if (!self.chatManager.isSupported()) {
            throw new Error('Chat is not supported by this agent.');
          }
          // Call the implementation's onToolResult method
          const implementation = self.chatManager.createImplementation();
          implementation.onToolResult(toolCallId, result, isError);
        },
        
        /**
         * Adds a listener for chat updates
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
         * Loads chat history from storage
         * Placeholder for future implementation
         */
        loadChatHistory: async () => {
          console.log('loadChatHistory: Not implemented yet');
        },
        
        /**
         * Saves chat history to storage
         * Placeholder for future implementation
         */
        saveChatHistory: async () => {
          console.log('saveChatHistory: Not implemented yet');
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
          self.messagingManager.clearUserMessageListeners();
          // Clear chat listeners if chat is supported
          if (self.chatManager.isSupported()) {
            self.chatManager.clearAllUpdateListeners();
          }
        },
      },
    };
  }
}