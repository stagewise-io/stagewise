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
          prompts.getUserMessagePrompt({
            userMessage: message,
          }),
        );
        break;
      case 'assistant': {
        if (
          message.parts.every(
            (part) => part.type === 'reasoning' || part.type === 'step-start',
          )
        )
          continue; // skip assistant messages with only reasoning parts

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
                // Extract part.output.hiddenMetadata
                if ('hiddenMetadata' in part.output) {
                  const { hiddenMetadata: _hiddenMetadata, ...cleanOutput } =
                    part.output;
                  return {
                    ...part,
                    output: cleanOutput,
                  };
                } else {
                  return {
                    ...part,
                    output: part.output,
                  };
                }
              }
            }
            return part;
          }),
        };
        const convertedMessages = convertToModelMessages([cleanedMessage]);
        const sanitizedConvertedMessages = convertedMessages.map((message) =>
          sanitizeModelMessageToolCallInput(message),
        );
        modelMessages.push(...sanitizedConvertedMessages);
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

/**
 * This fixes the issue that the ai SDK returns the tool call input as a string, which is not JSON parsable and lets the litellm backend fail.
 *
 * @param message - The model message to sanitize.
 * @returns The sanitized model message.
 */
function sanitizeModelMessageToolCallInput(
  message: ModelMessage,
): ModelMessage {
  if (typeof message.content === 'string') return message;
  if (message.role !== 'assistant') return message;

  return {
    ...message,
    content: message.content.map((part) => {
      if (part.type === 'tool-call' && typeof part.input === 'string') {
        return {
          ...part,
          input: JSON.parse(part.input),
        };
      }
      return part;
    }),
  };
}
