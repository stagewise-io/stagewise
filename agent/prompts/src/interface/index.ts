import type { SystemModelMessage, UserModelMessage } from 'ai';
import type { PromptSnippet } from '@stagewise/agent-types';
import type { ChatMessage } from '@stagewise/karton-contract';

export type SystemPromptConfig = {
  userMessageMetadata?: ChatMessage['metadata'];
  promptSnippets?: PromptSnippet[];
};

export type UserMessagePromptConfig = {
  userMessage: ChatMessage;
};

export abstract class Prompts {
  abstract getSystemPrompt(config: SystemPromptConfig): SystemModelMessage;
  abstract getUserMessagePrompt(
    config: UserMessagePromptConfig,
  ): UserModelMessage;
}
