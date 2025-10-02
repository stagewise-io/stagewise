import type { ChatMessage } from '@stagewise/karton-contract';
import type { RouterOutputs } from '@stagewise/api-client';
import type { KartonContract } from '@stagewise/karton-contract';

// Event types for analytics tracking
export type AgentEventType =
  | 'agent_prompt_triggered'
  | 'tool_call_requested'
  | 'tool_call_completed'
  | 'agent_state_changed'
  | 'agent_response_received'
  | 'credits_insufficient'
  | 'plan_limits_exceeded';

interface BaseAgentEvent {
  type: AgentEventType;
  timestamp: Date;
}

export interface CreditsInsufficientEvent extends BaseAgentEvent {
  type: 'credits_insufficient';
  data: {
    subscription: KartonContract['state']['userAccount']['subscription'];
  };
}

export interface PlanLimitsExceededEvent extends BaseAgentEvent {
  type: 'plan_limits_exceeded';
  data: {
    subscription: KartonContract['state']['userAccount']['subscription'];
  };
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
      NonNullable<RouterOutputs['chat']['callAgent']['response']>
    >['credits'];
  };
}

export type AgentEvent =
  | AgentPromptTriggeredEvent
  | CreditsInsufficientEvent
  | PlanLimitsExceededEvent
  | ToolCallRequestedEvent
  | ToolCallCompletedEvent
  | AgentStateChangedEvent
  | AgentResponseReceivedEvent;

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
  creditsInsufficient: (
    subscription: KartonContract['state']['userAccount']['subscription'],
  ): CreditsInsufficientEvent => ({
    type: 'credits_insufficient',
    timestamp: new Date(),
    data: {
      subscription,
    },
  }),

  planLimitsExceeded: (
    subscription: KartonContract['state']['userAccount']['subscription'],
  ): PlanLimitsExceededEvent => ({
    type: 'plan_limits_exceeded',
    timestamp: new Date(),
    data: {
      subscription,
    },
  }),

  agentPromptTriggered: (
    userMessage?: ChatMessage,
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
      NonNullable<RouterOutputs['chat']['callAgent']['response']>
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
};
