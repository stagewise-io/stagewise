import type { TabMentionMeta } from '@shared/karton-contracts/ui/agent/metadata.js';
import xml from 'xml';
import specialTokens from '../special-tokens.js';

/**
 * Render a tab mention as an `<attach>` XML snippet for model context.
 *
 * File and workspace mentions are handled by the `pathReferences`
 * pipeline (file-read-transformer) and no longer need context snippets.
 * Only tab mentions still need an inline XML attachment because the
 * environment snapshot already lists all open tabs — the mention simply
 * re-emphasises which tab the user is referring to.
 */
export function tabMentionToContextSnippet(mention: TabMentionMeta): string {
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
