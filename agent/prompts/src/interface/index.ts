import type { SystemModelMessage, UserModelMessage } from 'ai';
import type {
  ChatMessage,
  MainTab,
  Layout,
  KartonContract,
} from '@stagewise/karton-contract';
import type { PromptSnippet } from '@stagewise/agent-types';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';

export type SystemPromptConfig = (
  | {
      currentTab: Layout.SETUP_WORKSPACE;
    }
  | {
      currentTab: MainTab.IDEATION_CANVAS;
    }
  | {
      currentTab: MainTab.DEV_APP_PREVIEW;
    }
  | {
      currentTab: MainTab.SETTINGS;
    }
) & {
  userMessageMetadata?: ChatMessage['metadata'];
  promptSnippets?: PromptSnippet[];
};

export type UserMessagePromptConfig = {
  userMessage: ChatMessage;
};

export abstract class Prompts {
  abstract getSystemPrompt(
    clientRuntime: ClientRuntime,
    kartonState: KartonContract['state'],
  ): Promise<SystemModelMessage>;
  abstract getUserMessagePrompt(
    config: UserMessagePromptConfig,
  ): UserModelMessage;
}
