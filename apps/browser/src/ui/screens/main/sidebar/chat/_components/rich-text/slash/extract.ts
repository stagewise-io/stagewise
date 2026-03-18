import type { Content, JSONContent } from '@tiptap/core';

export interface SlashItemMeta {
  id: string;
  source: 'builtin';
}

/**
 * Extracts slash command items from TipTap editor content.
 * Each `slash` node carries an `id` attribute populated by the provider.
 * Results are deduplicated by id.
 */
export function extractSlashItemsFromTiptapContent(
  doc: Content | undefined,
): SlashItemMeta[] {
  if (!doc || typeof doc === 'string') return [];

  const items: SlashItemMeta[] = [];
  const seen = new Set<string>();

  const traverse = (node: JSONContent) => {
    if (node.type === 'slash' && node.attrs?.id) {
      const id = node.attrs.id as string;
      if (!seen.has(id)) {
        seen.add(id);
        items.push({ id, source: 'builtin' });
      }
    }
    if (Array.isArray(node.content))
      for (const child of node.content) traverse(child as JSONContent);
  };

  traverse(doc as JSONContent);
  return items;
}
