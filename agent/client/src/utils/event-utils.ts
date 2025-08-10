import type { ChatUserMessage } from '@stagewise/agent-interface-internal/agent';
import type { RouterOutputs } from '@stagewise/api-client';

// Event types for analytics tracking
export type AgentEventType =
  | 'agent_prompt_triggered'
  | 'tool_call_requested'
  | 'tool_call_completed'
  | 'agent_state_changed'
  | 'agent_response_received'
  | 'auth_token_refresh_required';

interface BaseAgentEvent {
  type: AgentEventType;
  timestamp: Date;
}

export interface AgentPromptTriggeredEvent extends BaseAgentEvent {
  type: 'agent_prompt_triggered';
  data: {
    hasUserMessage: boolean;
    messageId?: string;
    currentUrl?: string | null;
    selectedElementsCount: number;
    promptSnippetsCount: number;
  };
}

export interface ToolCallRequestedEvent extends BaseAgentEvent {
  type: 'tool_call_requested';
  data: {
    toolName: string;
    isClientSide: boolean;
    isBrowserRuntime: boolean;
  };
}

export interface ToolCallCompletedEvent extends BaseAgentEvent {
  type: 'tool_call_completed';
  data: {
    toolName: string;
    success: boolean;
    errorType?: 'error' | 'user_interaction_required';
    duration: number;
  };
}

export interface AgentStateChangedEvent extends BaseAgentEvent {
  type: 'agent_state_changed';
  data: {
    previousIsWorking?: boolean;
    isWorking: boolean;
    description?: string;
  };
}

export interface AgentResponseReceivedEvent extends BaseAgentEvent {
  type: 'agent_response_received';
  data: {
    messageCount: number;
    hasToolCalls: boolean;
    toolCallCount: number;
    responseTime: number;
    credits: Awaited<
      NonNullable<RouterOutputs['agent']['callAgent']['response']>
    >['credits'];
  };
}

export interface AuthTokenRefreshRequiredEvent extends BaseAgentEvent {
  type: 'auth_token_refresh_required';
  data: {
    reason: 'expired' | 'invalid' | 'missing';
    retryAttempt: number;
    originalError?: string;
  };
}

export type AgentEvent =
  | AgentPromptTriggeredEvent
  | ToolCallRequestedEvent
  | ToolCallCompletedEvent
  | AgentStateChangedEvent
  | AgentResponseReceivedEvent
  | AuthTokenRefreshRequiredEvent;

export type AgentEventCallback = (event: AgentEvent) => void;

/**
 * Creates an event emitter that safely calls the callback
 */
export function createEventEmitter(callback?: AgentEventCallback) {
  return {
    emit: (event: AgentEvent): void => {
      if (!callback) return;

      try {
        callback(event);
      } catch (error) {
        console.error('[Agent]: Error in event callback:', error);
      }
    },
  };
}

/**
 * Event factory functions
 */
export const EventFactories = {
  agentPromptTriggered: (
    userMessage?: ChatUserMessage,
    promptSnippetsCount = 0,
  ): AgentPromptTriggeredEvent => ({
    type: 'agent_prompt_triggered',
    timestamp: new Date(),
    data: {
      hasUserMessage: !!userMessage,
      messageId: userMessage?.id,
      currentUrl: userMessage?.metadata?.browserData?.currentUrl || null,
      selectedElementsCount:
        userMessage?.metadata?.browserData?.selectedElements?.length || 0,
      promptSnippetsCount,
    },
  }),

  toolCallRequested: (
    toolName: string,
    isClientSide: boolean,
    isBrowserRuntime: boolean,
  ): ToolCallRequestedEvent => ({
    type: 'tool_call_requested',
    timestamp: new Date(),
    data: {
      toolName,
      isClientSide,
      isBrowserRuntime,
    },
  }),

  toolCallCompleted: (
    toolName: string,
    success: boolean,
    duration: number,
    errorType?: 'error' | 'user_interaction_required',
  ): ToolCallCompletedEvent => ({
    type: 'tool_call_completed',
    timestamp: new Date(),
    data: {
      toolName,
      success,
      errorType,
      duration,
    },
  }),

  agentStateChanged: (
    isWorking: boolean,
    previousIsWorking?: boolean,
    description?: string,
  ): AgentStateChangedEvent => ({
    type: 'agent_state_changed',
    timestamp: new Date(),
    data: {
      previousIsWorking,
      isWorking,
      description,
    },
  }),

  agentResponseReceived: ({
    messageCount,
    hasToolCalls,
    toolCallCount,
    responseTime,
    credits,
  }: {
    messageCount: number;
    hasToolCalls: boolean;
    toolCallCount: number;
    responseTime: number;
    credits: Awaited<
      NonNullable<RouterOutputs['agent']['callAgent']['response']>
    >['credits'];
  }): AgentResponseReceivedEvent => ({
    type: 'agent_response_received',
    timestamp: new Date(),
    data: {
      messageCount,
      hasToolCalls,
      toolCallCount,
      responseTime,
      credits,
    },
  }),

  authTokenRefreshRequired: (
    reason: 'expired' | 'invalid' | 'missing',
    retryAttempt: number,
    originalError?: string,
  ): AuthTokenRefreshRequiredEvent => ({
    type: 'auth_token_refresh_required',
    timestamp: new Date(),
    data: {
      reason,
      retryAttempt,
      originalError,
    },
  }),
};
