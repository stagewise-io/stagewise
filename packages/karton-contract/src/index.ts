import type { AppType } from '@stagewise/karton/shared';
import { type CoreMessage, coreUserMessageSchema, type Tool } from 'ai';
import { userMessageMetadataSchema } from './metadata';
import { z } from 'zod';

export const userMessageSchema = z.intersection(
  coreUserMessageSchema,
  z.object({
    metadata: userMessageMetadataSchema,
  }),
);

export type UserMessage = z.infer<typeof userMessageSchema>;

type AgentError = {
  type: 'agent-error';
  error: Error;
};

type ChatId = string;

type AppState = {
  chats: Record<
    ChatId,
    {
      title: string;
      createdAt: Date;
      messages: (CoreMessage | UserMessage)[];
      error?: AgentError;
    }
  >;
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
