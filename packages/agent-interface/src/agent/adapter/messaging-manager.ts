import type { MessagingImplementation } from '../../router/capabilities/messaging';
import type {
  AgentMessageContentItemPart,
  AgentMessageUpdate,
  UserMessage,
} from '../../router/capabilities/messaging/types';
import { PushController } from './push-controller';

/**
 * MessagingManager - Manages agent messaging functionality
 * 
 * This class handles the messaging capability for agents that don't use
 * the newer chat interface. It manages:
 * - Current message being composed by the agent
 * - Streaming updates as the agent generates content
 * - User message listeners for incoming messages
 * - Message part management (text, images, etc.)
 * 
 * Note: This is being phased out in favor of the ChatManager for new implementations.
 * When chat is enabled, messaging functionality is disabled and will return empty data.
 */
export class MessagingManager {
  /**
   * Unique identifier for the current message being composed
   */
  private currentMessageId: string | null = null;
  
  /**
   * Array of content parts that make up the current message
   * Can include text, images, or other content types
   */
  private messageContent: AgentMessageContentItemPart[] = [];
  
  /**
   * Set of listener functions that get called when a user message is received
   */
  private userMessageListeners: Set<(message: UserMessage) => void> = new Set();
  
  /**
   * Controller for broadcasting message updates to subscribers
   */
  private readonly controller: PushController<AgentMessageUpdate>;
  
  /**
   * Function to generate unique IDs for messages
   */
  private readonly idGenerator: () => string;
  
  /**
   * Function to check if chat is enabled
   * When chat is enabled, messaging should be disabled
   */
  private isChatEnabled: () => boolean;

  constructor(idGenerator: () => string, isChatEnabled: () => boolean = () => false) {
    this.idGenerator = idGenerator;
    this.isChatEnabled = isChatEnabled;
    
    // Create controller without initial value
    // Initial sync happens on first subscription
    this.controller = new PushController();
  }

  /**
   * Sets the function to check if chat is enabled
   * @param checkFn - Function that returns true if chat is enabled
   */
  public setChatEnabledCheck(checkFn: () => boolean): void {
    this.isChatEnabled = checkFn;
  }

  /**
   * Gets the current message content
   * Returns empty array if chat is enabled
   * 
   * @returns Array of message content parts
   */
  public get(): AgentMessageContentItemPart[] {
    if (this.isChatEnabled()) {
      return [];
    }
    return JSON.parse(JSON.stringify(this.messageContent));
  }

  /**
   * Gets the current message ID
   * Returns null if chat is enabled
   * 
   * @returns The current message ID or null if no message is active
   */
  public getCurrentId(): string | null {
    if (this.isChatEnabled()) {
      return null;
    }
    return this.currentMessageId;
  }

  /**
   * Gets the complete current message with ID and parts
   * Returns empty data if chat is enabled
   * 
   * @returns Object containing message ID and content parts
   */
  public getCurrentMessage(): { id: string | null; parts: AgentMessageContentItemPart[] } {
    if (this.isChatEnabled()) {
      return { id: null, parts: [] };
    }
    return {
      id: this.currentMessageId,
      parts: JSON.parse(JSON.stringify(this.messageContent)),
    };
  }

  /**
   * Clears the current message and starts a new one
   * Fails silently if chat is enabled
   */
  public clear(): void {
    if (this.isChatEnabled()) {
      console.warn('Messaging is disabled when chat is enabled. Use chat functionality instead.');
      return;
    }
    
    // Generate new message ID
    this.currentMessageId = this.idGenerator();
    this.messageContent = [];

    // Create resync update to signal clearing of previous content
    const update: AgentMessageUpdate = {
      messageId: this.currentMessageId,
      updateParts: [],
      createdAt: new Date(),
      resync: true, // This tells consumers to clear their display
    };
    
    this.controller.push(update);
  }

  /**
   * Sets the complete message content, replacing any existing content
   * Throws error if chat is enabled
   * 
   * @param content - Array of message parts to set
   * @throws Error if chat is enabled
   */
  public set(content: AgentMessageContentItemPart[]): void {
    if (this.isChatEnabled()) {
      throw new Error('Messaging is disabled when chat is enabled. Use chat functionality instead.');
    }
    
    // Always create a new message ID when setting new content
    this.currentMessageId = this.idGenerator();
    this.messageContent = JSON.parse(JSON.stringify(content));

    // Create update with all content parts
    const update: AgentMessageUpdate = {
      messageId: this.currentMessageId,
      updateParts: this.messageContent.map((part, i) => ({
        contentIndex: i,
        part: part,
      })),
      createdAt: new Date(),
      resync: true, // Full replacement of content
    };
    
    this.controller.push(update);
  }

  /**
   * Adds one or more parts to the current message
   * Throws error if chat is enabled
   * 
   * @param content - Single part or array of parts to add
   * @throws Error if chat is enabled
   */
  public addPart(content: AgentMessageContentItemPart | AgentMessageContentItemPart[]): void {
    if (this.isChatEnabled()) {
      throw new Error('Messaging is disabled when chat is enabled. Use chat functionality instead.');
    }
    
    // Initialize message if needed
    if (!this.currentMessageId) {
      this.clear();
    }

    // Normalize to array
    const partsToAdd = Array.isArray(content) ? content : [content];
    
    // Add each part and notify subscribers
    for (const part of partsToAdd) {
      const contentIndex = this.messageContent.length;
      this.messageContent.push(part);

      const update: AgentMessageUpdate = {
        messageId: this.currentMessageId!,
        updateParts: [{ contentIndex, part }],
        createdAt: new Date(),
        resync: false, // Incremental update
      };
      
      this.controller.push(update);
    }
  }

  /**
   * Updates a specific part of the message by index
   * Throws error if chat is enabled
   * 
   * @param content - New content for the part
   * @param index - Index of the part to update
   * @param type - 'replace' to replace entirely, 'append' to add to existing text
   * @throws Error if index is invalid, append is used with non-text parts, or chat is enabled
   */
  public updatePart(
    content: AgentMessageContentItemPart | AgentMessageContentItemPart[],
    index: number,
    type: 'replace' | 'append'
  ): void {
    if (this.isChatEnabled()) {
      throw new Error('Messaging is disabled when chat is enabled. Use chat functionality instead.');
    }
    
    // Handle adding a new part at the end
    if (index === this.messageContent.length) {
      if (!this.currentMessageId) {
        this.clear();
      }

      // Extract single part from array if needed
      const contentPart = Array.isArray(content) ? content[0] : content;
      if (!contentPart) {
        throw new Error('Content cannot be empty');
      }

      // Add the new part
      this.messageContent.push(contentPart);

      const update: AgentMessageUpdate = {
        messageId: this.currentMessageId!,
        updateParts: [{ contentIndex: index, part: contentPart }],
        createdAt: new Date(),
        resync: type === 'replace',
      };
      
      this.controller.push(update);
      return;
    }

    // Validate index for existing parts
    if (index < 0 || index >= this.messageContent.length) {
      throw new Error(`Invalid index ${index} for message content update.`);
    }

    // Extract single part from array if needed
    const contentPart = Array.isArray(content) ? content[0] : content;
    if (!contentPart) {
      throw new Error('Content cannot be empty');
    }

    if (type === 'replace') {
      // Replace the entire part
      this.messageContent[index] = contentPart;
      
      const update: AgentMessageUpdate = {
        messageId: this.currentMessageId!,
        updateParts: [{ contentIndex: index, part: contentPart }],
        createdAt: new Date(),
        resync: true, // Full replacement requires resync
      };
      
      this.controller.push(update);
    } else if (type === 'append') {
      // Append only works for text parts
      const existingPart = this.messageContent[index];
      
      if (existingPart.type !== 'text' || contentPart.type !== 'text') {
        throw new Error('Append update is only valid for text-to-text parts.');
      }
      
      // Append text to existing part
      existingPart.text += contentPart.text;
      
      const update: AgentMessageUpdate = {
        messageId: this.currentMessageId!,
        updateParts: [{ contentIndex: index, part: contentPart }],
        createdAt: new Date(),
        resync: false, // Incremental append
      };
      
      this.controller.push(update);
    }
  }

  /**
   * Adds a listener for incoming user messages
   * Does nothing if chat is enabled
   * 
   * @param listener - Function to call when a user message is received
   */
  public addUserMessageListener(listener: (message: UserMessage) => void): void {
    if (this.isChatEnabled()) {
      console.warn('Messaging listeners are disabled when chat is enabled.');
      return;
    }
    this.userMessageListeners.add(listener);
  }

  /**
   * Removes a previously added user message listener
   * 
   * @param listener - The listener function to remove
   */
  public removeUserMessageListener(listener: (message: UserMessage) => void): void {
    this.userMessageListeners.delete(listener);
  }

  /**
   * Removes all user message listeners
   */
  public clearUserMessageListeners(): void {
    this.userMessageListeners.clear();
  }

  /**
   * Handles an incoming user message by notifying all listeners
   * Does nothing if chat is enabled
   * 
   * @param message - The user message to process
   */
  public handleUserMessage(message: UserMessage): void {
    if (this.isChatEnabled()) {
      console.warn('User messages should be sent through chat when chat is enabled.');
      return;
    }
    
    // In production, validate the message structure here
    // const validation = userMessageSchema.safeParse(message);
    // if (!validation.success) {
    //     console.error("Invalid UserMessage received:", validation.error);
    //     return;
    // }
    
    // Notify all registered listeners
    this.userMessageListeners.forEach((listener) => listener(message));
  }

  /**
   * Creates the implementation object for the router's messaging capability
   * This is what the toolbar uses to send messages and subscribe to updates
   * 
   * @returns The messaging implementation for the transport interface
   */
  public createImplementation(): MessagingImplementation {
    const self = this;
    
    return {
      /**
       * Called by the toolbar when the user sends a message
       */
      onUserMessage: (message) => {
        if (self.isChatEnabled()) {
          console.warn('User messages should be sent through chat when chat is enabled.');
          return;
        }
        self.handleUserMessage(message);
      },
      
      /**
       * Returns an AsyncIterable that yields message updates
       * Returns empty updates if chat is enabled
       */
      getMessage: () => {
        // Custom subscription logic to handle resync requirement
        const sub = self.controller.subscribe();
        const originalIterator = sub[Symbol.asyncIterator]();

        return {
          [Symbol.asyncIterator]: () => {
            let nextCallResynced = false; // Track if we've sent initial sync

            return {
              next: async () => {
                // If chat is enabled, always return empty resync
                if (self.isChatEnabled()) {
                  const emptyUpdate: AgentMessageUpdate = {
                    messageId: self.idGenerator(),
                    updateParts: [],
                    createdAt: new Date(),
                    resync: true,
                  };
                  return { value: emptyUpdate, done: false };
                }
                
                // On first call, send a resync with current state
                if (!nextCallResynced) {
                  nextCallResynced = true;
                  
                  const resyncUpdate: AgentMessageUpdate = {
                    messageId: self.currentMessageId ?? self.idGenerator(),
                    updateParts: self.messageContent.map((part, i) => ({
                      contentIndex: i,
                      part: part,
                    })),
                    createdAt: new Date(),
                    resync: true, // Full state sync
                  };
                  
                  // Create message ID if it doesn't exist yet
                  if (!self.currentMessageId) {
                    self.currentMessageId = resyncUpdate.messageId;
                  }
                  
                  return { value: resyncUpdate, done: false };
                }
                
                // After initial sync, return updates from the controller
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
    };
  }
}