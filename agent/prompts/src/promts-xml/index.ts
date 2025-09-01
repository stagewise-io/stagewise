import { Prompts } from '../interface/index.js';
import type {
  SystemPromptConfig,
  UserMessagePromptConfig,
} from '../interface/index.js';
import { getSystemPrompt } from './system.js';
import { getUserMessagePrompt } from './user.js';

export class XMLPrompts extends Prompts {
  getSystemPrompt(config: SystemPromptConfig) {
    return getSystemPrompt(config);
  }
  getUserMessagePrompt(config: UserMessagePromptConfig) {
    return getUserMessagePrompt(config);
  }
}
