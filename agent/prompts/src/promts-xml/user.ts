import type { UserMessagePromptConfig } from '../interface/index.js';
import { browserMetadataToContextSnippet } from '../utils/browser-metadata.js';
import { convertToModelMessages, type UserModelMessage } from 'ai';
import {
  serializeRelevantCodebaseFiles,
  serializeSelectedElement,
} from '../utils/html-elements.js';
import specialTokens from '../utils/special-tokens.js';
import xml from 'xml';

export function getUserMessagePrompt(
  config: UserMessagePromptConfig,
): UserModelMessage {
  // convert file parts and text to model messages (without metadata) to ensure correct mapping of ui parts to model content
  const convertedMessage: UserModelMessage = convertToModelMessages([
    config.userMessage,
  ])[0]! as UserModelMessage;

  // If the content is a string, we convert it to a single text part because we always want a parts array as content.
  if (typeof convertedMessage.content === 'string') {
    convertedMessage.content = [
      {
        type: 'text',
        text: convertedMessage.content,
      },
    ];
  }

  // We convert the text content of every user message to a XML-entry with CDATA in order to prevent stupid accidents due to weird user message content.
  convertedMessage.content.forEach((part) => {
    if (part.type === 'text') {
      part.text = xml({ 'user-msg': { _cdata: part.text } });
    }
  });

  const systemAttachmentTextPart: string[] = [];

  if (config.userMessage?.metadata?.currentTab) {
    systemAttachmentTextPart.push(
      `<${specialTokens.userMsgAttachmentXmlTag} type="displayed-ui" value="${config.userMessage?.metadata?.currentTab}"/>`,
    );
  }

  if (config.userMessage?.metadata?.browserData) {
    systemAttachmentTextPart.push(
      browserMetadataToContextSnippet(config.userMessage.metadata.browserData),
    );
  }

  if (
    config.userMessage?.metadata?.selectedPreviewElements &&
    config.userMessage.metadata.selectedPreviewElements.length > 0
  ) {
    // We add max 5 context elements to the system attachment to avoid overwhelming the model with too much information.
    // TODO: Add this limitation to the UI as well as to not introduce situations where the user expects the LLM to see more.
    config.userMessage.metadata.selectedPreviewElements
      .slice(0, 5)
      .forEach((element) => {
        systemAttachmentTextPart.push(serializeSelectedElement(element));
      });

    // We add the relevant codebase files to the system attachment to provide the LLM with the codebase context.
    // We limit this to max 3 files to avoid overwhelming the model with too much information.
    systemAttachmentTextPart.push(
      serializeRelevantCodebaseFiles(
        config.userMessage.metadata?.selectedPreviewElements ?? [],
        3,
      ),
    );
  }

  if (systemAttachmentTextPart.length > 0) {
    convertedMessage.content.push({
      type: 'text',
      text: systemAttachmentTextPart.join('\n'),
    });
  }

  return {
    role: 'user',
    content: convertedMessage.content,
  };
}
