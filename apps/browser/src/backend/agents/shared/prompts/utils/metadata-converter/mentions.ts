import type { MentionMeta } from '@shared/karton-contracts/ui/agent/metadata.js';
import xml from 'xml';
import specialTokens from '../special-tokens.js';

export function mentionToContextSnippet(mention: MentionMeta): string {
  if (mention.providerType === 'file') {
    return xml({
      [specialTokens.userMsgAttachmentXmlTag]: {
        _attr: {
          type: 'file-mention',
          path: mention.relativePath,
          'mounted-path': mention.mountedPath,
          filename: mention.fileName,
          ...(mention.isDirectory ? { 'is-directory': 'true' } : {}),
        },
      },
    });
  }

  if (mention.providerType === 'tab') {
    return xml({
      [specialTokens.userMsgAttachmentXmlTag]: {
        _attr: {
          type: 'tab-mention',
          'tab-id': mention.tabId,
          url: mention.url,
          title: mention.title,
        },
      },
    });
  }

  return xml({
    [specialTokens.userMsgAttachmentXmlTag]: {
      _attr: {
        type: 'workspace-mention',
        prefix: mention.prefix,
        name: mention.name,
        path: mention.path,
      },
    },
  });
}
