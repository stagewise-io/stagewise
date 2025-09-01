import type { ModelMessage, TextUIPart } from 'ai';
import type { ChatMessage } from '@stagewise/karton-contract';
import { XMLPrompts } from '@stagewise/agent-prompts';
import { convertToModelMessages } from 'ai';

const prompts = new XMLPrompts();

export function uiMessagesToModelMessages(
  messages: ChatMessage[],
  contextFiles: TextUIPart[] = [],
): ModelMessage[] {
  // Create a defensive copy of messages to avoid modifying the original array
  let processedMessages = messages;

  // If we have context files and the last message is from user, append them safely
  if (contextFiles.length > 0 && messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'user') {
      try {
        // Create a deep copy of the last message with appended context files
        const lastMessageWithContext: ChatMessage = {
          ...lastMessage,
          parts: [...(lastMessage.parts || []), ...contextFiles],
        };

        // Create a new array with all messages except the last one, plus the modified last message
        processedMessages = [...messages.slice(0, -1), lastMessageWithContext];
      } catch (_error) {
        // Fall back to original messages if modification fails
        processedMessages = messages;
      }
    }
  }

  const modelMessages: ModelMessage[] = [];
  for (const message of processedMessages) {
    switch (message.role) {
      case 'user':
        modelMessages.push(
          prompts.getUserMessagePrompt({ userMessage: message }),
        );
        console.log(
          'userMessage ',
          JSON.stringify(modelMessages[modelMessages.length - 1]),
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
