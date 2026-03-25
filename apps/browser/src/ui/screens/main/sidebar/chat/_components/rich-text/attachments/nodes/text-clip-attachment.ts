import {
  type Content,
  type JSONContent,
  Node,
  mergeAttributes,
} from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Fragment } from '@tiptap/pm/model';
import { generateId } from 'ai';
import { TextClipAttachmentView } from './text-clip-attachment-view';
import { markdownToTipTapContent } from '@ui/utils/tiptap-content-utils';
import {
  type AttachmentNodeOptions,
  type AttachmentType,
  ALL_ATTACHMENT_NODE_NAMES,
  NODE_NAME_TO_TYPE,
} from '../types';
import { getAttachmentAnchorText } from '@ui/components/streamdown';
import type { TextClipAttachment as TextClipAttachmentMetadata } from '@shared/karton-contracts/ui/agent/metadata';

/** Minimum character length for text to be converted to a text clip on paste */
const TEXT_CLIP_THRESHOLD = 100;

/**
 * Extracts text clip attachments from TipTap JSON content.
 * Used to collect all text clips before sending a message so the agent
 * can correlate @{id} references with the full text content.
 *
 * @param doc - TipTap content
 * @returns Array of text clip attachment data (id, label, content)
 */
export function extractTextClipsFromTiptapContent(
  doc: Content | undefined,
): TextClipAttachmentMetadata[] {
  if (!doc || typeof doc === 'string') return [];

  try {
    const clips: TextClipAttachmentMetadata[] = [];

    const traverse = (node: {
      type?: string;
      attrs?: { id?: string; label?: string; content?: string };
      content?: unknown[];
    }) => {
      if (node.type === 'textClipAttachment' && node.attrs)
        clips.push({
          id: node.attrs.id ?? '',
          label: node.attrs.label ?? '',
          content: node.attrs.content ?? '',
        });

      if (Array.isArray(node.content))
        node.content.forEach((child) =>
          traverse(
            child as {
              type?: string;
              attrs?: { id?: string; label?: string; content?: string };
              content?: unknown[];
            },
          ),
        );
    };

    traverse(doc as JSONContent);
    return clips;
  } catch {
    return [];
  }
}

/**
 * Checks if HTML content contains existing attachment nodes.
 * Used to prevent converting pasted content that already has attachments.
 */
function hasAttachmentNodes(html: string): boolean {
  return (
    html.includes('data-file-attachment') ||
    html.includes('data-image-attachment') ||
    html.includes('data-element-attachment') ||
    html.includes('data-text-clip-attachment')
  );
}

/**
 * Text clip attachment node for collapsed long text.
 *
 * This node is self-contained and includes:
 * - Node definition (inline, atomic, selectable, draggable)
 * - `resolveTextClip` command to expand the node back to plain text
 * - ProseMirror paste plugin to intercept long text pastes
 *
 * When text >= 100 characters is pasted (without existing attachment nodes),
 * it's automatically converted to a collapsible text clip badge.
 */
export const TextClipAttachment = Node.create<AttachmentNodeOptions>({
  name: 'textClipAttachment',

  addOptions() {
    return {
      onNodeDeleted: undefined,
    };
  },

  group: 'inline',

  inline: true,

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-id'),
        renderHTML: (attributes) => ({
          'data-id': attributes.id as string,
        }),
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label'),
        renderHTML: (attributes) => ({
          'data-label': attributes.label as string,
        }),
      },
      content: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-content'),
        renderHTML: (attributes) => ({
          'data-content': attributes.content as string,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-text-clip-attachment]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ 'data-text-clip-attachment': '' }, HTMLAttributes),
      `@${HTMLAttributes['data-id'] || 'textclip'}`,
    ];
  },

  renderText({ node }) {
    // Unlike other attachments that reference external data via ID,
    // text clips contain the full content - so we return it directly
    return getAttachmentAnchorText({
      type: 'textClip',
      id: node.attrs.id,
    });
  },

  // Markdown support: Use a custom tokenizer to recognize our text-clip link syntax
  markdownTokenizer: {
    name: 'textClipAttachment',
    level: 'inline' as const,
    // Start function helps the tokenizer find potential matches quickly
    // Returns number (index of match, or -1 if no match per marked.js convention)
    start(src: string) {
      return src.match(/\[\]\(text-clip:/)?.index ?? -1;
    },
    // Tokenize function parses our custom link syntax
    tokenize(src: string) {
      // Match empty link syntax with text-clip protocol: [](text-clip:id)
      const match = src.match(/^\[\]\(text-clip:((?:[^()]|\([^()]*\))+)\)/);
      if (!match) return undefined;

      return {
        type: 'textClipAttachment',
        raw: match[0],
        id: match[1],
      };
    },
  },

  // Parse the custom token created by our tokenizer
  // This is only called for tokens with type matching our tokenizer's name
  // Token has additional 'id' property from our custom tokenizer
  parseMarkdown(token) {
    const id = token.id as string;
    return {
      type: 'textClipAttachment',
      attrs: {
        id,
        label: id,
        // Note: content will be empty here and needs to be rehydrated from metadata
        content: '',
      },
    };
  },

  // Markdown support: serialize text clip nodes back to markdown links
  renderMarkdown(node: any) {
    return `[](text-clip:${node.attrs.id})`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(TextClipAttachmentView);
  },

  addCommands() {
    return {
      /**
       * Resolves a text clip node back to its content.
       * Parses mention/attachment link syntax back into proper nodes.
       * Falls back to plain text insertion if parsing fails.
       */
      resolveTextClip:
        (id: string) =>
        ({ tr, state, dispatch }) => {
          let nodePos: number | null = null;
          let nodeContent = '';

          state.doc.descendants((node, pos) => {
            if (
              node.type.name === 'textClipAttachment' &&
              node.attrs.id === id
            ) {
              nodePos = pos;
              nodeContent = node.attrs.content as string;
              return false; // Stop iteration
            }
          });

          if (nodePos !== null && dispatch) {
            try {
              // Parse content through the markdown pipeline to restore
              // mention/attachment nodes from their serialized link syntax
              const parsed = markdownToTipTapContent(nodeContent);
              const paragraphs = parsed.content ?? [];

              // Collect inline nodes from all paragraphs, joining with hardBreak
              const inlineNodes: PMNode[] = [];
              for (let i = 0; i < paragraphs.length; i++) {
                const paraContent = paragraphs[i]?.content;
                if (paraContent)
                  for (const child of paraContent)
                    inlineNodes.push(state.schema.nodeFromJSON(child));

                // Add hard break between paragraphs (not after the last one)
                if (i < paragraphs.length - 1)
                  inlineNodes.push(
                    state.schema.nodeFromJSON({ type: 'hardBreak' }),
                  );
              }

              if (inlineNodes.length > 0) {
                tr.replaceWith(
                  nodePos,
                  nodePos + 1,
                  Fragment.from(inlineNodes),
                );
              } else {
                // Empty parse result — insert content as plain text
                tr.replaceWith(
                  nodePos,
                  nodePos + 1,
                  state.schema.text(nodeContent),
                );
              }
            } catch {
              // Parsing failed — fall back to plain text
              tr.replaceWith(
                nodePos,
                nodePos + 1,
                state.schema.text(nodeContent),
              );
            }
            dispatch(tr);
            return true;
          }
          return false;
        },
    };
  },

  addProseMirrorPlugins() {
    const nodeName = this.name;
    const { onNodeDeleted } = this.options;

    return [
      // Paste plugin to intercept long text
      new Plugin({
        key: new PluginKey('textClipPaste'),
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData('text/plain') || '';
            const html = event.clipboardData?.getData('text/html') || '';

            // Skip if text is too short
            if (text.length < TEXT_CLIP_THRESHOLD) return false;

            // Skip if pasted content contains existing attachment nodes
            if (hasAttachmentNodes(html)) return false;

            // Create text clip node
            event.preventDefault();
            const { state, dispatch } = view;
            const node = state.schema.nodes[nodeName]!.create({
              id: generateId(),
              label: `${text.substring(0, 20).trim()}...`,
              content: text,
            });
            dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
            return true;
          },
        },
      }),
      // Deletion tracking plugin (consistent with other attachment nodes)
      new Plugin({
        key: new PluginKey(`${nodeName}Deletion`),
        appendTransaction: (transactions, oldState, newState) => {
          if (!onNodeDeleted) return null;

          // Only process if document changed
          const docChanged = transactions.some((tr) => tr.docChanged);
          if (!docChanged) return null;

          // Collect attachment nodes from old and new states
          const oldNodes = new Map<string, AttachmentType>();
          oldState.doc.descendants((node) => {
            if (ALL_ATTACHMENT_NODE_NAMES.includes(node.type.name as never)) {
              const type =
                NODE_NAME_TO_TYPE[
                  node.type.name as keyof typeof NODE_NAME_TO_TYPE
                ];
              if (type) oldNodes.set(node.attrs.id, type);
            }
          });

          const newNodeIds = new Set<string>();
          newState.doc.descendants((node) => {
            if (ALL_ATTACHMENT_NODE_NAMES.includes(node.type.name as never))
              newNodeIds.add(node.attrs.id);
          });

          // Fire callback for nodes that existed in old state but not in new state
          // Only fire once per deletion (use first node name to ensure single callback)
          if (nodeName === ALL_ATTACHMENT_NODE_NAMES[0])
            oldNodes.forEach((type, id) => {
              if (!newNodeIds.has(id)) onNodeDeleted(id, type);
            });

          return null;
        },
      }),
    ];
  },
});
