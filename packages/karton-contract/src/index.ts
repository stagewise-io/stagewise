import type { UserMessageMetadata, SelectedElement } from './metadata.js';
import type { UIMessage, UIDataTypes } from 'ai';
import type { UITools, ToolPart } from '@stagewise/agent-tools';
import type { Tool, FileDiff, ToolResult } from '@stagewise/agent-types';
import type { RouterOutputs } from '@stagewise/api-client';

export type ChatMessage = UIMessage<UserMessageMetadata, UIDataTypes, UITools>;
export type { UserMessageMetadata, SelectedElement };

export type { FileDiff, ToolResult };

export type UserInputUpdate = {
  chatInput: string;
  browserData?: UserMessageMetadata['browserData'];
  pluginContentItems?: UserMessageMetadata['pluginContentItems'];
};

export type {
  TextUIPart,
  FileUIPart,
  ReasoningUIPart,
  DynamicToolUIPart,
  ToolUIPart,
} from 'ai';

export type { ToolPart };

export type History = ChatMessage[];

type ChatId = string;

export type Chat = {
  title: string;
  createdAt: Date;
  messages: History;
  error?: AgentError;
};

export enum AgentErrorType {
  INSUFFICIENT_CREDITS = 'insufficient-credits-message',
  PLAN_LIMITS_EXCEEDED = 'plan-limits-exceeded',
  AGENT_ERROR = 'agent-error',
  OTHER = 'other',
}

export type AgentError =
  | {
      type: AgentErrorType.INSUFFICIENT_CREDITS;
      error: { name: string; message: string };
    }
  | {
      type: AgentErrorType.PLAN_LIMITS_EXCEEDED;
      error: {
        name: string;
        message: string;
        isPaidPlan: boolean;
        cooldownMinutes?: number;
      };
    }
  | {
      type: AgentErrorType.AGENT_ERROR;
      error: { name: string; message: string };
    }
  | {
      type: AgentErrorType.OTHER;
      error: { name: string; message: string };
    };

type AppState = {
  activeChatId: ChatId | null;
  chats: Record<ChatId, Chat>;
  toolCallApprovalRequests: string[];
  isWorking: boolean;
  subscription?: RouterOutputs['subscription']['getSubscription'];
};

export type KartonContract = {
  state: AppState;
  clientProcedures: {
    getAvailableTools: () => Promise<Tool[]>;
  };
  serverProcedures: {
    createChat: () => Promise<string>;
    switchChat: (chatId: string) => Promise<void>;
    deleteChat: (chatId: string) => Promise<void>;
    sendUserMessage: (message: ChatMessage) => Promise<void>;
    sendUserInputUpdate: (update: UserInputUpdate) => Promise<void>;
    retrySendingUserMessage: () => Promise<void>;
    abortAgentCall: () => Promise<void>;
    approveToolCall: (toolCallId: string) => Promise<void>;
    rejectToolCall: (toolCallId: string) => Promise<void>;
    refreshSubscription: () => Promise<void>;
    undoToolCallsUntilUserMessage: (
      userMessageId: string,
      chatId: string,
    ) => Promise<void>;
    undoToolCallsUntilLatestUserMessage: (
      chatId: string,
    ) => Promise<ChatMessage | null>;
    assistantMadeCodeChangesUntilLatestUserMessage: (
      chatId: string,
    ) => Promise<boolean>;
  };
};
