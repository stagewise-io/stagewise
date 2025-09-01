import type { ModelMessage } from 'ai';
import type { ChatMessage } from '@stagewise/karton-contract';
import { XMLPrompts } from '@stagewise/agent-prompts';
import { convertToModelMessages } from 'ai';

const prompts = new XMLPrompts();

export function uiMessagesToModelMessages(
  messages: ChatMessage[],
): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];
  for (const message of messages) {
    switch (message.role) {
      case 'user':
        modelMessages.push(
          prompts.getUserMessagePrompt({ userMessage: message }),
        );
        break;
      default: {
        const convertedMessages = convertToModelMessages([message]);
        modelMessages.push(...convertedMessages);
        break;
      }
    }
  }
  return modelMessages;
}
