import type { KartonContract } from '@stagewise/karton-contract';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { Prompts } from '../interface/index.js';
import type { UserMessagePromptConfig } from '../interface/index.js';
import { getSystemPrompt } from './system.js';
import { getUserMessagePrompt } from './user.js';

export class XMLPrompts extends Prompts {
  async getSystemPrompt(
    clientRuntime: ClientRuntime,
    kartonState: KartonContract['state'],
  ) {
    return await getSystemPrompt(clientRuntime, kartonState);
  }
  getUserMessagePrompt(config: UserMessagePromptConfig) {
    return getUserMessagePrompt(config);
  }
}
