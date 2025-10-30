import type { UserMessagePromptConfig } from '../interface/index.js';
import { convertToModelMessages, type UserModelMessage } from 'ai';
import { htmlElementToContextSnippet } from '../utils/html-elements.js';

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

  const tabMetadataSnippet = config.userMessage?.metadata?.currentTab
    ? `<agent_mode>This message was sent in the ${config.userMessage?.metadata?.currentTab} mode.</agent_mode>`
    : null;

  const codeContentSnippet: string[] = [];
  config.userMessage.metadata?.selectedPreviewElements?.forEach(
    async (element) => {
      if (!element.codeMetadata) return;

      const _startLine = element.codeMetadata.startLine - 200;
      const _endLine = element.codeMetadata.endLine + 200;
      const startLine = Math.max(1, _startLine);
      const endLine = Math.min(
        element.codeMetadata.content?.split('\n').length || 0,
        _endLine,
      );

      const codeContent = element.codeMetadata.content
        ?.split('\n')
        .slice(startLine - 1, endLine)
        .join('\n');

      const snippet = `
 <snippet>
 <description>A code snippet from the file ${element.codeMetadata.relativePath} between lines ${startLine} and ${endLine} (inclusive)</description>
 <content>${codeContent}</content>
</snippet>`;
      codeContentSnippet.push(snippet);
    },
  );

  // const metadataSnippet =
  //   config.userMessage?.metadata?.currentTab === MainTab.DEV_APP_PREVIEW &&
  //   config.userMessage?.metadata?.browserData
  //     ? browserMetadataToContextSnippet(config.tabData.browserData)
  //     : null;

  const selectedElementsSnippet =
    (config.userMessage.metadata?.selectedPreviewElements?.length || 0) > 0
      ? htmlElementToContextSnippet(
          config.userMessage.metadata?.selectedPreviewElements ?? [],
        )
      : undefined;

  // if (metadataSnippet) {
  //   content.push({
  //     type: 'text',
  //     text: metadataSnippet,
  //   });
  // }

  if (tabMetadataSnippet) {
    content.push({
      type: 'text',
      text: tabMetadataSnippet,
    });
  }

  if (selectedElementsSnippet) {
    content.push({
      type: 'text',
      text: selectedElementsSnippet,
    });
  }

  if (codeContentSnippet.length > 0) {
    content.push({
      type: 'text',
      text: codeContentSnippet.join('\n\n'),
    });
  }

  return {
    role: 'user',
    content,
  };
}
