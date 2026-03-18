import Mention from '@tiptap/extension-mention';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { SlashNodeView } from './slash-node-view';
import { createSlashSuggestionRenderer } from './suggestion-renderer';
import { querySlashItems } from './provider';
import type { SlashItem } from './types';

const SLASH_PROTOCOL = 'slash';

/**
 * Slash extension — a separate TipTap node type for `/` commands.
 *
 * Built via `Mention.extend({ name: 'slash' })` so it gets its own
 * ProseMirror node type, independent of `@`-mentions. This means:
 * - Own attributes, serialization, node view, and extract function
 * - Own suggestion popup and active flag
 * - No coupling with mention logic
 */
export const SlashExtension = Mention.extend({
  name: 'slash',

  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-id'),
        renderHTML: (attributes: Record<string, string>) => ({
          'data-id': attributes.id,
        }),
      },
      label: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-label'),
        renderHTML: (attributes: Record<string, string>) => ({
          'data-label': attributes.label,
        }),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(
      SlashNodeView as Parameters<typeof ReactNodeViewRenderer>[0],
    );
  },

  renderText({ node }) {
    return `[${node.attrs.label ?? `/${node.attrs.id}`}](${SLASH_PROTOCOL}:${node.attrs.id})`;
  },

  renderMarkdown(node: any) {
    return `[${node.attrs.label ?? `/${node.attrs.id}`}](${SLASH_PROTOCOL}:${node.attrs.id})`;
  },

  markdownTokenizer: {
    name: 'slash',
    level: 'inline' as const,
    start(src: string) {
      return src.match(/\[[^\]]*\]\(slash:/)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^\[([^\]]*)\]\(slash:([^)]+)\)/);
      if (!match) return undefined;
      return {
        type: 'slash',
        raw: match[0],
        label: match[1],
        id: match[2],
      };
    },
  },

  parseMarkdown(token: any) {
    return {
      type: 'slash',
      attrs: {
        id: token.id,
        label: token.label || `/${token.id}`,
      },
    };
  },
}).configure({
  HTMLAttributes: { class: 'slash-node' },
  suggestion: {
    char: '/',
    allowSpaces: false,
    items: async ({ query }: { query: string; editor: any }) => {
      return querySlashItems(query);
    },
    command: ({ editor, range, props }: any) => {
      const item = props as SlashItem;
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: 'slash',
            attrs: {
              id: item.id,
              label: `/${item.id}`,
            },
          },
          { type: 'text', text: ' ' },
        ])
        .run();
    },
    render: createSlashSuggestionRenderer,
  },
});
