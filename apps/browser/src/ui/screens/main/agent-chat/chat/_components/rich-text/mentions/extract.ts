import type { Content, JSONContent } from '@tiptap/core';
import {
  mentionMetaSchema,
  type MentionMeta,
} from '@shared/karton-contracts/ui/agent/metadata';

/**
 * Extracts self-contained mention metadata from TipTap editor content.
 * Each mention node carries a `meta` attribute populated by the provider,
 * which is a discriminated union (FileMentionMeta | TabMentionMeta | WorkspaceMentionMeta).
 * Results are deduplicated by providerType + canonical ID.
 */
export function extractMentionsFromTiptapContent(
  doc: Content | undefined,
): MentionMeta[] {
  if (!doc || typeof doc === 'string') return [];

  const mentions: MentionMeta[] = [];
  const seen = new Set<string>();

  const dedupeKey = (meta: MentionMeta): string => {
    if (meta.providerType === 'file') return `file:${meta.mountedPath}`;
    if (meta.providerType === 'tab') return `tab:${meta.tabId}`;
    return `workspace:${meta.prefix}`;
  };

  const traverse = (node: JSONContent) => {
    if (node.type === 'mention' && node.attrs?.meta) {
      const parsed = mentionMetaSchema.safeParse(node.attrs.meta);
      if (!parsed.success) return;
      const meta = parsed.data;
      const key = dedupeKey(meta);
      if (!seen.has(key)) {
        seen.add(key);
        mentions.push(meta);
      }
    }
    if (Array.isArray(node.content))
      for (const child of node.content) traverse(child as JSONContent);
  };

  traverse(doc as JSONContent);
  return mentions;
}
