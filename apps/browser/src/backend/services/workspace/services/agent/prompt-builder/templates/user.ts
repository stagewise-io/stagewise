import type { ChatMessage, SelectedElement } from '@shared/karton-contracts/ui';
import { convertToModelMessages, type UserModelMessage } from 'ai';
import xml from 'xml';
import specialTokens from '../utils/special-tokens';
import { browserMetadataToContextSnippet } from '../utils/metadata-converter/browser-metadata';
import {
  relevantCodebaseFilesToContextSnippet,
  selectedElementToContextSnippet,
} from '../utils/metadata-converter/html-elements';

export async function getUserMessage(
  userMessage: ChatMessage,
): Promise<UserModelMessage> {
  // convert file parts and text to model messages (without metadata) to ensure correct mapping of ui parts to model content
  const convertedMessage = (
    await convertToModelMessages([userMessage])
  )[0]! as UserModelMessage;

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

  if (
    userMessage.metadata?.rejectedEdits &&
    userMessage.metadata.rejectedEdits.length > 0
  ) {
    systemAttachmentTextPart.push(
      `<${specialTokens.userMsgAttachmentXmlTag} type="rejected-edits" value="${userMessage.metadata.rejectedEdits.join(',')}"/>`,
    );
  }

  if (userMessage.metadata?.browserData) {
    systemAttachmentTextPart.push(
      browserMetadataToContextSnippet(userMessage.metadata.browserData),
    );
  }

  if (
    userMessage.metadata?.selectedPreviewElements &&
    userMessage.metadata.selectedPreviewElements.length > 0
  ) {
    // We add max 5 context elements to the system attachment to avoid overwhelming the model with too much information.
    // TODO: Add this limitation to the UI as well as to not introduce situations where the user expects the LLM to see more.
    userMessage.metadata.selectedPreviewElements
      .slice(0, 5)
      .forEach((element) => {
        systemAttachmentTextPart.push(
          selectedElementToContextSnippet(element as SelectedElement),
        );
      });

    // We add the relevant codebase files to the system attachment to provide the LLM with the codebase context.
    // We limit this to max 6 files to provide sufficient context for design cloning.
    systemAttachmentTextPart.push(
      relevantCodebaseFilesToContextSnippet(
        (userMessage.metadata?.selectedPreviewElements ??
          []) as SelectedElement[],
        6,
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
