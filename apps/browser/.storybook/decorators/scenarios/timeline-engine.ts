import type { AppState } from '@shared/karton-contracts/ui';
import { splitIntoChunks } from './shared-utilities';

/**
 * Timeline event types
 */
export type TimelineEvent =
  | AddMessageEvent
  | UpdateMessagePartEvent
  | StreamTextPartEvent
  | StreamReasoningPartEvent
  | UpdateToolStateEvent
  | StreamToolInputFieldEvent
  | SetIsWorkingEvent
  | WaitEvent;

/**
 * Base event interface
 */
interface BaseEvent {
  /** Timestamp in milliseconds from timeline start */
  timestamp: number;
}

/**
 * Add a new message to the chat
 */
export interface AddMessageEvent extends BaseEvent {
  type: 'add-message';
  message: any; // ChatMessage
}

/**
 * Update a specific part of a message
 */
export interface UpdateMessagePartEvent extends BaseEvent {
  type: 'update-message-part';
  messageId: string;
  partIndex: number;
  updater: (part: any) => any;
}

/**
 * Stream text content progressively
 */
export interface StreamTextPartEvent extends BaseEvent {
  type: 'stream-text-part';
  messageId: string;
  partIndex: number;
  fullText: string;
  chunkStrategy: 'char' | 'word' | 'sentence' | 'line';
  intervalMs: number;
  /** Duration for this streaming phase */
  duration: number;
}

/**
 * Stream reasoning content progressively
 */
export interface StreamReasoningPartEvent extends BaseEvent {
  type: 'stream-reasoning-part';
  messageId: string;
  partIndex: number;
  fullText: string;
  chunkStrategy: 'char' | 'word' | 'sentence' | 'line';
  intervalMs: number;
  /** Duration for this streaming phase */
  duration: number;
}

/**
 * Update a tool's state (input-streaming → input-available → output-available)
 */
export interface UpdateToolStateEvent extends BaseEvent {
  type: 'update-tool-state';
  messageId: string;
  toolCallId: string;
  newState: 'input-streaming' | 'input-available' | 'output-available';
  /** Optional: Update input data when transitioning states */
  input?: any;
  /** Optional: Add output data when reaching output-available */
  output?: any;
}

/**
 * Stream a nested field within a tool's input progressively
 */
export interface StreamToolInputFieldEvent extends BaseEvent {
  type: 'stream-tool-input-field';
  messageId: string;
  toolCallId: string;
  fieldPath: string; // e.g., 'input.content'
  targetContent: string;
  chunkStrategy: 'char' | 'word' | 'line';
  intervalMs: number;
  /** Duration for this streaming phase */
  duration: number;
}

/**
 * Set the isWorking flag
 */
export interface SetIsWorkingEvent extends BaseEvent {
  type: 'set-is-working';
  isWorking: boolean;
}

/**
 * Wait/pause for a duration (no state change)
 */
export interface WaitEvent extends BaseEvent {
  type: 'wait';
  duration: number;
}

/**
 * Timeline execution state
 */
interface TimelineExecutionState {
  currentState: Partial<AppState>;
  currentTime: number;
  isRunning: boolean;
  isPaused: boolean;
  events: TimelineEvent[];
  streamingStates: Map<string, StreamingState>;
}

/**
 * State for active streaming operations
 */
interface StreamingState {
  event:
    | StreamTextPartEvent
    | StreamReasoningPartEvent
    | StreamToolInputFieldEvent;
  chunks: string[];
  currentChunkIndex: number;
  timerId?: NodeJS.Timeout;
}

/**
 * Timeline executor manages the execution of timeline events
 */
export class TimelineExecutor {
  private state: TimelineExecutionState;
  private onStateChange: (state: Partial<AppState>) => void;
  private timers: Set<NodeJS.Timeout>;

  constructor(
    events: TimelineEvent[],
    initialState: Partial<AppState>,
    onStateChange: (state: Partial<AppState>) => void,
  ) {
    // Sort events by timestamp
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    this.state = {
      currentState: initialState,
      currentTime: -1,
      isRunning: false,
      isPaused: false,
      events: sortedEvents,
      streamingStates: new Map(),
    };

    this.onStateChange = onStateChange;
    this.timers = new Set();
  }

  /**
   * Start executing the timeline
   */
  start(): void {
    if (this.state.isRunning) return;

    this.state.isRunning = true;
    this.state.currentTime = -1;
    this.executeNextEvent();
  }

  /**
   * Stop and cleanup all timers
   */
  stop(): void {
    this.state.isRunning = false;
    this.state.isPaused = false;

    // Clear all timers
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();

    // Clear streaming states
    this.state.streamingStates.forEach((streamingState) => {
      if (streamingState.timerId) {
        clearTimeout(streamingState.timerId);
      }
    });
    this.state.streamingStates.clear();
  }

  /**
   * Execute the next event in the timeline
   */
  private executeNextEvent(): void {
    if (!this.state.isRunning || this.state.isPaused) return;

    // Find next event to execute (use >= to include same-timestamp events)
    const nextEvent = this.state.events.find(
      (e) => e.timestamp >= this.state.currentTime,
    );

    if (!nextEvent) {
      // No more events, timeline complete
      this.state.isRunning = false;
      return;
    }

    // Calculate delay until next event
    const delay = Math.max(0, nextEvent.timestamp - this.state.currentTime);

    const timer = setTimeout(() => {
      this.timers.delete(timer);

      // Remove executed event from array to avoid re-execution
      const eventIndex = this.state.events.indexOf(nextEvent);
      if (eventIndex !== -1) {
        this.state.events.splice(eventIndex, 1);
      }

      // Update currentTime to event's timestamp
      this.state.currentTime = nextEvent.timestamp;

      this.executeEvent(nextEvent);
      this.executeNextEvent(); // Continue to next event
    }, delay);

    this.timers.add(timer);
  }

  /**
   * Execute a single event
   */
  private executeEvent(event: TimelineEvent): void {
    switch (event.type) {
      case 'add-message':
        this.handleAddMessage(event);
        break;

      case 'update-message-part':
        this.handleUpdateMessagePart(event);
        break;

      case 'stream-text-part':
        this.handleStreamTextPart(event);
        break;

      case 'stream-reasoning-part':
        this.handleStreamReasoningPart(event);
        break;

      case 'update-tool-state':
        this.handleUpdateToolState(event);
        break;

      case 'stream-tool-input-field':
        this.handleStreamToolInputField(event);
        break;

      case 'set-is-working':
        this.handleSetIsWorking(event);
        break;

      case 'wait':
        // Wait events are handled by the delay in executeNextEvent
        break;
    }
  }

  /**
   * Add a new message
   */
  private handleAddMessage(event: AddMessageEvent): void {
    const chatId =
      this.state.currentState.agentChat?.activeChatId || 'streaming-chat';
    const existingChat = this.state.currentState.agentChat?.chats?.[chatId];

    const updatedMessages = [...(existingChat?.messages || []), event.message];

    this.state.currentState = {
      ...this.state.currentState,
      workspace: {
        ...this.state.currentState.workspace,
      },
      agentChat: {
        ...this.state.currentState.agentChat,
        chats: {
          ...this.state.currentState.agentChat?.chats,
          [chatId]: {
            ...existingChat,
            messages: updatedMessages,
          },
        },
      },
    } as Partial<AppState>;

    this.emitStateChange();
  }

  /**
   * Update a specific message part
   */
  private handleUpdateMessagePart(event: UpdateMessagePartEvent): void {
    this.updateMessage(event.messageId, (message) => {
      const updatedParts = [...message.parts];
      updatedParts[event.partIndex] = event.updater(
        updatedParts[event.partIndex],
      );
      return {
        ...message,
        parts: updatedParts,
      };
    });
  }

  /**
   * Start streaming text content
   */
  private handleStreamTextPart(event: StreamTextPartEvent): void {
    const streamingKey = `${event.messageId}-${event.partIndex}`;
    const chunks = splitIntoChunks(event.fullText, event.chunkStrategy);

    const streamingState: StreamingState = {
      event,
      chunks,
      currentChunkIndex: 0,
    };

    this.state.streamingStates.set(streamingKey, streamingState);
    this.progressTextStreaming(streamingKey);
  }

  /**
   * Progress text streaming by one chunk
   */
  private progressTextStreaming(streamingKey: string): void {
    const streamingState = this.state.streamingStates.get(streamingKey);
    if (!streamingState) return;

    const event = streamingState.event as StreamTextPartEvent;
    const currentText = streamingState.chunks
      .slice(0, streamingState.currentChunkIndex + 1)
      .join('');

    const isComplete =
      streamingState.currentChunkIndex >= streamingState.chunks.length - 1;

    // Update the text part
    this.updateMessage(event.messageId, (message) => {
      const updatedParts = [...message.parts];
      updatedParts[event.partIndex] = {
        ...updatedParts[event.partIndex],
        text: currentText,
        state: isComplete ? undefined : ('streaming' as const),
      };
      return {
        ...message,
        parts: updatedParts,
      };
    });

    // Continue streaming if not complete
    if (!isComplete) {
      streamingState.currentChunkIndex++;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.progressTextStreaming(streamingKey);
      }, event.intervalMs);
      streamingState.timerId = timer;
      this.timers.add(timer);
    } else {
      // Clean up streaming state
      this.state.streamingStates.delete(streamingKey);
    }
  }

  /**
   * Start streaming reasoning content
   */
  private handleStreamReasoningPart(event: StreamReasoningPartEvent): void {
    const streamingKey = `reasoning-${event.messageId}-${event.partIndex}`;
    const chunks = splitIntoChunks(event.fullText, event.chunkStrategy);

    const streamingState: StreamingState = {
      event,
      chunks,
      currentChunkIndex: 0,
    };

    this.state.streamingStates.set(streamingKey, streamingState);
    this.progressReasoningStreaming(streamingKey);
  }

  /**
   * Progress reasoning streaming by one chunk
   */
  private progressReasoningStreaming(streamingKey: string): void {
    const streamingState = this.state.streamingStates.get(streamingKey);
    if (!streamingState) return;

    const event = streamingState.event as StreamReasoningPartEvent;
    const currentText = streamingState.chunks
      .slice(0, streamingState.currentChunkIndex + 1)
      .join('');

    const isComplete =
      streamingState.currentChunkIndex >= streamingState.chunks.length - 1;

    // Update the reasoning part
    this.updateMessage(event.messageId, (message) => {
      const updatedParts = [...message.parts];
      updatedParts[event.partIndex] = {
        ...updatedParts[event.partIndex],
        text: currentText,
        state: isComplete ? ('done' as const) : ('streaming' as const),
      };
      return {
        ...message,
        parts: updatedParts,
      };
    });

    // Continue streaming if not complete
    if (!isComplete) {
      streamingState.currentChunkIndex++;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.progressReasoningStreaming(streamingKey);
      }, event.intervalMs);
      streamingState.timerId = timer;
      this.timers.add(timer);
    } else {
      // Clean up streaming state
      this.state.streamingStates.delete(streamingKey);
    }
  }

  /**
   * Update a tool's state
   */
  private handleUpdateToolState(event: UpdateToolStateEvent): void {
    this.updateMessage(event.messageId, (message) => {
      const updatedParts = message.parts.map((part: any) => {
        if (
          part.type.startsWith('tool-') &&
          'toolCallId' in part &&
          part.toolCallId === event.toolCallId
        ) {
          const updatedPart: any = {
            ...part,
            state: event.newState,
          };

          if (event.input) {
            updatedPart.input = event.input;
          }

          if (event.output && event.newState === 'output-available') {
            updatedPart.output = event.output;
          }

          return updatedPart;
        }
        return part;
      });

      return {
        ...message,
        parts: updatedParts,
      };
    });
  }

  /**
   * Start streaming a tool input field
   */
  private handleStreamToolInputField(event: StreamToolInputFieldEvent): void {
    const streamingKey = `tool-${event.messageId}-${event.toolCallId}-${event.fieldPath}`;
    const chunks = splitIntoChunks(event.targetContent, event.chunkStrategy);

    const streamingState: StreamingState = {
      event,
      chunks,
      currentChunkIndex: 0,
    };

    this.state.streamingStates.set(streamingKey, streamingState);
    this.progressToolInputFieldStreaming(streamingKey);
  }

  /**
   * Progress tool input field streaming
   */
  private progressToolInputFieldStreaming(streamingKey: string): void {
    const streamingState = this.state.streamingStates.get(streamingKey);
    if (!streamingState) return;

    const event = streamingState.event as StreamToolInputFieldEvent;
    const currentContent = streamingState.chunks
      .slice(0, streamingState.currentChunkIndex + 1)
      .join('');

    const isComplete =
      streamingState.currentChunkIndex >= streamingState.chunks.length - 1;

    // Update the tool input field
    this.updateMessage(event.messageId, (message) => {
      const updatedParts = message.parts.map((part: any) => {
        if (
          part.type.startsWith('tool-') &&
          'toolCallId' in part &&
          part.toolCallId === event.toolCallId
        ) {
          // Set nested field value
          const updatedInput = this.setNestedField(
            part.input || {},
            event.fieldPath.replace('input.', ''),
            currentContent,
          );

          return {
            ...part,
            input: updatedInput,
          };
        }
        return part;
      });

      return {
        ...message,
        parts: updatedParts,
      };
    });

    // Continue streaming if not complete
    if (!isComplete) {
      streamingState.currentChunkIndex++;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.progressToolInputFieldStreaming(streamingKey);
      }, event.intervalMs);
      streamingState.timerId = timer;
      this.timers.add(timer);
    } else {
      // Clean up streaming state
      this.state.streamingStates.delete(streamingKey);
    }
  }

  /**
   * Set isWorking flag
   */
  private handleSetIsWorking(event: SetIsWorkingEvent): void {
    this.state.currentState = {
      ...this.state.currentState,
      workspace: {
        ...this.state.currentState.workspace,
      },
      agentChat: {
        ...this.state.currentState.agentChat,
        isWorking: event.isWorking,
      },
    } as Partial<AppState>;

    this.emitStateChange();
  }

  /**
   * Helper to update a message by ID
   */
  private updateMessage(
    messageId: string,
    updater: (message: any) => any,
  ): void {
    const chatId =
      this.state.currentState.agentChat?.activeChatId || 'streaming-chat';
    const existingChat = this.state.currentState.agentChat?.chats?.[chatId];

    const updatedMessages = (existingChat?.messages || []).map((msg: any) => {
      if (msg.id === messageId) {
        return updater(msg);
      }
      return msg;
    });

    this.state.currentState = {
      ...this.state.currentState,
      workspace: {
        ...this.state.currentState.workspace,
      },
      agentChat: {
        ...this.state.currentState.agentChat,
        chats: {
          ...this.state.currentState.agentChat?.chats,
          [chatId]: {
            ...existingChat,
            messages: updatedMessages,
          },
        },
      },
    } as Partial<AppState>;

    this.emitStateChange();
  }

  /**
   * Helper to set nested field value
   * Handles both objects and arrays in the path
   */
  private setNestedField(obj: any, path: string, value: any): any {
    const keys = path.split('.');
    const result = Array.isArray(obj) ? [...obj] : { ...obj };

    let current = result;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]!;
      const nextKey = keys[i + 1];
      const isArrayIndex = /^\d+$/.test(key);
      const nextIsArrayIndex = nextKey && /^\d+$/.test(nextKey);

      if (isArrayIndex) {
        // Current key is an array index
        const index = Number.parseInt(key, 10);
        if (!Array.isArray(current)) {
          throw new Error(
            `Expected array at path "${keys.slice(0, i).join('.')}", but got object`,
          );
        }
        // Preserve array element (could be object or array)
        current[index] = Array.isArray(current[index])
          ? [...current[index]]
          : { ...(current[index] || {}) };
        current = current[index];
      } else {
        // Current key is an object property
        if (nextIsArrayIndex) {
          // Next level should be an array
          current[key] = Array.isArray(current[key])
            ? [...current[key]]
            : current[key]
              ? [{ ...current[key] }]
              : [];
        } else {
          // Next level is an object
          current[key] = Array.isArray(current[key])
            ? [...current[key]]
            : { ...(current[key] || {}) };
        }
        current = current[key];
      }
    }

    // Set the final value
    const lastKey = keys[keys.length - 1]!;
    const isArrayIndex = /^\d+$/.test(lastKey);

    if (isArrayIndex) {
      const index = Number.parseInt(lastKey, 10);
      if (!Array.isArray(current)) {
        throw new Error(
          `Expected array at path "${keys.slice(0, -1).join('.')}", but got object`,
        );
      }
      current[index] = value;
    } else {
      current[lastKey] = value;
    }

    return result;
  }

  /**
   * Emit state change
   */
  private emitStateChange(): void {
    this.onStateChange(this.state.currentState);
  }

  /**
   * Get current state
   */
  getCurrentState(): Partial<AppState> {
    return this.state.currentState;
  }
}
