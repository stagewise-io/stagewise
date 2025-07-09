import type {
  AgentAvailability,
  AgentAvailabilityError,
} from '../router/capabilities/availability/types';
import type {
  AgentMessageContentItemPart,
  UserMessage,
} from '../router/capabilities/messaging/types';
import type {
  AgentState,
  AgentStateType,
} from '../router/capabilities/state/types';
import type {
  Tool,
  ToolCallResult,
  PendingToolCall,
} from '../router/capabilities/tool-calling/types';

export type AgentInterface = {
  /**
   * AVAILABILITY MANAGEMENT
   * Simple boolean-based availability with error handling
   */
  availability: {
    /** Get current availability status */
    get: () => AgentAvailability;

    /**
     * Set agent availability.
     *
     * When setting available to false, an error type is required to indicate
     * the reason for unavailability. The errorMessage parameter is optional
     * and provides additional context about the error.
     *
     * When setting available to true, error parameters are ignored.
     */
    set: <T extends boolean>(
      available: T,
      ...args: T extends false
        ? [error: AgentAvailabilityError, errorMessage?: string]
        : []
    ) => void;
  };

  /**
   * STATE MANAGEMENT
   * Simple state operations with optional descriptions
   */
  state: {
    /** Get current agent state */
    get: () => AgentState;

    /** Set agent state with optional description */
    set: (state: AgentStateType, description?: string) => void;
  };

  /**
   * MESSAGE MANAGEMENT
   * High-level message operations with automatic concatenation
   */
  messaging: {
    /** Get current agent message content (returns concatenated message) */
    get: () => AgentMessageContentItemPart[];

    /** Set complete agent message (replaces all content) */
    set: (content: AgentMessageContentItemPart[]) => void;

    /** Append a new part to current message */
    addPart: (
      content: AgentMessageContentItemPart | AgentMessageContentItemPart[],
    ) => void;

    /**
     * Update a part of the current message.
     *
     * @param content - The content to update with
     * @param index - The index of the part to update. If index equals the current
     *                message length (highest index + 1), a new part will be added.
     * @param type - 'replace' to replace the part, 'append' to append text (text parts only).
     *               When using 'append', only the delta (new text) is sent in the update,
     *               not the entire content.
     */
    updatePart: (
      content: AgentMessageContentItemPart | AgentMessageContentItemPart[],
      index: number,
      type: 'replace' | 'append',
    ) => void;

    /** Clears current message and starts a new one. Will change the current ID.*/
    clear: () => void;

    /** Get current message ID */
    getCurrentId: () => string | null;

    /** Get current message state as an object (returns by value, not reference) */
    getCurrentMessage: () => {
      id: string | null;
      parts: AgentMessageContentItemPart[];
    };

    /** Add a listener for user messages */
    addUserMessageListener: (listener: (message: UserMessage) => void) => void;

    /** Remove a specific user message listener */
    removeUserMessageListener: (
      listener: (message: UserMessage) => void,
    ) => void;

    /** Clear all user message listeners */
    clearUserMessageListeners: () => void;
  };

  /**
   * TOOL CALLING MANAGEMENT (Optional)
   * Simplified tool calling with automatic lifecycle management
   */
  toolCalling: {
    /** Set tool call support.
     * Agents have to manually set this to true if they want to support tool calling.
     *
     * Calling other functions in the toolCalling object will throw an error
     * if tool calling is not supported.
     */
    setToolCallSupport: (supported: boolean) => void;

    /** Get a list of all available tools */
    getAvailableTools: () => Tool[];

    /** Add a listener that get's triggered whenever the list of available tools changes */
    onToolListUpdate: (listener: (tools: Tool[]) => void) => void;

    /** Remove a specific tool list update listener */
    removeToolListUpdateListener: (listener: (tools: Tool[]) => void) => void;

    /** Clear all tool list update listeners */
    clearToolListUpdateListeners: () => void;

    /** Make a tool call and wait for the result */
    requestToolCall: (
      toolName: string,
      parameters: Record<string, unknown>,
    ) => Promise<ToolCallResult>;

    /** Get all pending tool calls */
    getPendingToolCalls: () => PendingToolCall[];
  };

  /**
   * CLEANUP MANAGEMENT
   * Methods to properly clean up resources and prevent memory leaks
   */
  cleanup: {
    /** Clear all listeners and cleanup resources */
    clearAllListeners: () => void;
  };
};
