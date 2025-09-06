import type { UserMessagePromptConfig } from '../interface/index.js';
import { browserMetadataToContextSnippet } from './browser-metadata.js';
import { convertToModelMessages, type UserModelMessage } from 'ai';
import { htmlElementToContextSnippet } from './html-elements.js';

export function getUserMessagePrompt(
  config: UserMessagePromptConfig,
): UserModelMessage {
  // convert file parts and text to model messages (without metadata) to ensure correct mapping of ui parts to model content
  const convertedMessage = convertToModelMessages([config.userMessage]);

  const content: UserModelMessage['content'] = [];

  // exactly 1 message is the expected case, the latter is for unexpected conversion behavior of the ai library
  if (convertedMessage.length === 1) {
    const message = convertedMessage[0]! as UserModelMessage;
    if (typeof message.content === 'string') {
      content.push({
        type: 'text',
        text: message.content,
      });
    } else {
      for (const part of message.content) content.push(part);
    }
  } else {
    // add content of all messages to the content array and pass it to user message
    for (const message of convertedMessage) {
      for (const c of (message as UserModelMessage).content) {
        if (typeof c === 'string')
          content.push({
            type: 'text',
            text: c,
          });
        else content.push(c);
      }
    }
  }

  const metadataSnippet = config.userMessage.metadata?.browserData
    ? browserMetadataToContextSnippet(config.userMessage.metadata?.browserData)
    : null;
  const selectedElementsSnippet =
    (config.userMessage.metadata?.browserData?.selectedElements?.length || 0) >
    0
      ? htmlElementToContextSnippet(
          config.userMessage.metadata?.browserData?.selectedElements ?? [],
        )
      : undefined;

  if (metadataSnippet) {
    content.push({
      type: 'text',
      text: metadataSnippet,
    });
  }

  if (selectedElementsSnippet) {
    content.push({
      type: 'text',
      text: selectedElementsSnippet,
    });
  }

  return {
    role: 'user',
    content,
  };
}
