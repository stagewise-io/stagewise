import type { AppType } from '@stagewise/karton/shared';
import {
  type CoreAssistantMessage,
  type CoreToolMessage,
  coreUserMessageSchema,
  type Tool,
} from 'ai';
import { userMessageMetadataSchema } from './metadata';
import { z } from 'zod';

export const userMessageSchema = z.intersection(
  coreUserMessageSchema,
  z.object({
    metadata: userMessageMetadataSchema,
    id: z.string(),
  }),
);

export type UserMessage = z.infer<typeof userMessageSchema>;

export type {
  ToolResultPart,
  ToolCallPart,
  FilePart,
  TextPart,
  ImagePart,
} from 'ai';

export type ChatMessage = (
  | CoreAssistantMessage
  | CoreToolMessage
  | UserMessage
) & {
  createdAt: Date;
};

export type History = ChatMessage[];
type ChatId = string;
export type Chat = {
  title: string;
  createdAt: Date;
  messages: History;
  error?: AgentError;
};

type AgentError = {
  type: 'agent-error';
  error: Error;
};

type AppState = {
  activeChatId: ChatId | null;
  chats: Record<ChatId, Chat>;
  toolCallApprovalRequests: string[];
  isWorking: boolean;
};

export type KartonContract = AppType<{
  state: AppState;
  clientProcedures: {
    getAvailableTools: () => Promise<Tool[]>;
    getActiveChat: () => Promise<string>;
  };
  serverProcedures: {
    createChat: () => Promise<string>;
    switchChat: (chatId: string) => Promise<void>;
    deleteChat: (chatId: string) => Promise<void>;
    sendUserMessage: (message: UserMessage) => Promise<void>;
    abortAgentCall: () => Promise<void>;
    approveToolCall: (toolCallId: string) => Promise<void>;
    rejectToolCall: (toolCallId: string) => Promise<void>;
  };
}>;
