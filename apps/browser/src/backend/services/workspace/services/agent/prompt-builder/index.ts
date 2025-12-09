// The prompt builder receives all required information about the app
// and then converts a set of UI messages to model messages that then can simply be used to trigger a LLM.

import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { ChatMessage, KartonContract } from '@shared/karton-contracts/ui';
import { convertToModelMessages, type ModelMessage } from 'ai';
import { getSystemPrompt } from './templates/system-prompt';
import { getUserMessage } from './templates/user';

export class PromptBuilder {
  constructor(
    private readonly clientRuntime: ClientRuntime | null,
    private readonly kartonState: KartonContract['state'],
  ) {}

  public async convertUIToModelMessages(
    chatMessages: ChatMessage[],
  ): Promise<ModelMessage[]> {
    // Get the system prompt and put that on the start
    const systemPrompt = await getSystemPrompt(
      this.kartonState,
      this.clientRuntime,
    );
    const modelMessages: ModelMessage[] = [systemPrompt];

    for (const message of chatMessages) {
      switch (message.role) {
        case 'user':
          modelMessages.push(getUserMessage(message));
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
                  // Extract part.output.hiddenFromLLM
                  if ('hiddenFromLLM' in part.output) {
                    const { hiddenFromLLM: _hiddenFromLLM, ...cleanOutput } =
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
}

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
