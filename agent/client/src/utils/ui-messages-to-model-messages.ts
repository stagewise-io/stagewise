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
      case 'assistant': {
        // Create a new message with cleaned tool outputs
        const cleanedMessage = {
          ...message,
          parts: message.parts.map((part) => {
            if (
              part.type === 'tool-deleteFileTool' ||
              part.type === 'tool-overwriteFileTool' ||
              part.type === 'tool-multiEditTool'
            ) {
              // Create a new part without diff and undoExecute
              if (part.output) {
                const {
                  diff: _diff,
                  undoExecute: _undoExecute,
                  ...cleanOutput
                } = part.output;
                return {
                  ...part,
                  output: cleanOutput,
                };
              }
            }
            return part;
          }),
        };
        const convertedMessages = convertToModelMessages([cleanedMessage]);
        modelMessages.push(...convertedMessages);
        break;
      }
      default: {
        const convertedMessages = convertToModelMessages([message]);
        modelMessages.push(...convertedMessages);
        break;
      }
    }
  }
  return modelMessages;
}
