import Mention from '@tiptap/extension-mention';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MentionNodeView } from './mention-node-view';
import { createSuggestionRenderer } from './suggestion-renderer';
import { queryAllProviders } from './providers';
import type { MentionContext } from './providers/types';
import type { ResolvedMentionItem } from './types';

const MENTION_PROTOCOL = 'mention';

/**
 * Module-level ref holding the latest MentionContext.
 * Written synchronously by ChatInput during render so
 * the TipTap suggestion `items` callback always sees
 * current data (useEffect is too late — it fires after paint).
 */
export const mentionContextRef: { current: MentionContext } = {
  current: {
    agentInstanceId: null,
    searchFiles: null,
    tabs: {},
    activeTabId: null,
    mounts: [],
    onFileMentionSelected: null,
  },
};

export const MentionExtension = Mention.extend({
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      providerType: {
        default: 'file',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-provider-type'),
        renderHTML: (attributes: Record<string, string>) => ({
          'data-provider-type': attributes.providerType,
        }),
      },
      meta: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute('data-meta');
          return raw ? JSON.parse(raw) : null;
        },
        renderHTML: (attributes: Record<string, any>) => ({
          'data-meta': attributes.meta ? JSON.stringify(attributes.meta) : null,
        }),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(
      MentionNodeView as Parameters<typeof ReactNodeViewRenderer>[0],
    );
  },

  renderText({ node }) {
    return `[${node.attrs.label ?? node.attrs.id}](mention:${node.attrs.providerType}:${node.attrs.id})`;
  },

  renderMarkdown(node: any) {
    return `[${node.attrs.label ?? node.attrs.id}](${MENTION_PROTOCOL}:${node.attrs.providerType}:${node.attrs.id})`;
  },

  markdownTokenizer: {
    name: 'mention',
    level: 'inline' as const,
    start(src: string) {
      return src.match(/\[[^\]]*\]\(mention:/)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(
        /^\[([^\]]*)\]\(mention:([^:)]+):((?:[^()]|\([^()]*\))+)\)/,
      );
      if (!match) return undefined;
      return {
        type: 'mention',
        raw: match[0],
        label: match[1],
        providerType: match[2],
        id: match[3],
      };
    },
  },

  parseMarkdown(token: any) {
    return {
      type: 'mention',
      attrs: {
        id: token.id,
        label: token.label || token.id,
        providerType: token.providerType,
      },
    };
  },
}).configure({
  HTMLAttributes: { class: 'mention-node' },
  suggestion: {
    char: '@',
    allowSpaces: false,
    items: async ({ query }: { query: string; editor: any }) => {
      return queryAllProviders(query, mentionContextRef.current);
    },
    command: ({ editor, range, props }: any) => {
      const item = props as ResolvedMentionItem;
      // Side-effect: register file mentions as FileAttachment entries in the
      // composer immediately on selection so the backend never needs to
      // resolve mount paths from mention metadata at send time.
      if (
        item.providerType === 'file' &&
        !item.meta.isDirectory &&
        mentionContextRef.current.onFileMentionSelected
      ) {
        mentionContextRef.current.onFileMentionSelected(
          item as import('./types').FileMentionItem,
        );
      }
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: 'mention',
            attrs: {
              id: item.id,
              label: item.label,
              providerType: item.providerType,
              meta: item.meta,
            },
          },
          { type: 'text', text: ' ' },
        ])
        .run();
    },
    render: createSuggestionRenderer,
  },
});
