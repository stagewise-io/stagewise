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

export type History = (CoreAssistantMessage | CoreToolMessage | UserMessage)[];
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
    sendUserMessage: (message: UserMessage) => Promise<void>;
    abortAgentCall: () => Promise<void>;
  };
}>;
