// The prompt builder receives all required information about the app
// and then converts a set of UI messages to model messages that then can simply be used to trigger a LLM.

import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { ChatMessage, KartonContract } from '@stagewise/karton-contract';
import { convertToModelMessages, type ModelMessage } from 'ai';
import { getSystemPrompt } from './templates/system-prompt';
import { getUserMessage } from './templates/user';

export class PromptBuilder {
  constructor(
    private readonly clientRuntime: ClientRuntime,
    private readonly kartonState: KartonContract['state'],
  ) {}

  public async convertUIToModelMessages(
    chatMessages: ChatMessage[],
  ): Promise<ModelMessage[]> {
    // Get the system prompt and put that on the start
    const systemPrompt = await getSystemPrompt(
      this.clientRuntime,
      this.kartonState,
    );
    const modelMessages: ModelMessage[] = [systemPrompt];

    // TODO We'll cache every 5000 tokens of messages to the model.
    // (glenn): I selected this value randomly, but I'm sure we can calculate a better threshold if we invest a bit more time. This should be better than without caching though.
    // const cumulativeTokenCount = 0;
    // const lastCacheTokenCount = 0;
    // const cacheThreshold = 5000;

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

    // make every 10th message a cached message (super easy approach)
    const cacheEveryNthMessage = 10;
    for (const [index, message] of modelMessages.entries()) {
      // Start index is 1 because the system prompt is the first message and already has a cache key with long ttl.
      if ((index + 1) % cacheEveryNthMessage === 0) {
        message.providerOptions = {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        };
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
