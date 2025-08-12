import type { UserMessageMetadata, SelectedElement } from './metadata.js';
import type { UIMessage } from 'ai';
import type { Tool } from '@stagewise/agent-types';

export type ChatMessage = UIMessage<UserMessageMetadata>;
export type { UserMessageMetadata, SelectedElement };

export type {
  TextUIPart,
  FileUIPart,
  ReasoningUIPart,
  DynamicToolUIPart,
} from 'ai';

export type History = ChatMessage[];

type ChatId = string;

export type Chat = {
  title: string;
  createdAt: Date;
  messages: History;
  error?: AgentError;
};

export type AgentError = {
  type: 'agent-error';
  error: Error;
};

type AppState = {
  activeChatId: ChatId | null;
  chats: Record<ChatId, Chat>;
  toolCallApprovalRequests: string[];
  isWorking: boolean;
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
    retrySendingUserMessage: () => Promise<void>;
    abortAgentCall: () => Promise<void>;
    approveToolCall: (toolCallId: string) => Promise<void>;
    rejectToolCall: (toolCallId: string) => Promise<void>;
  };
};
