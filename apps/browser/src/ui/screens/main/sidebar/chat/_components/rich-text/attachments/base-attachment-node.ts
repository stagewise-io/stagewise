import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { AttachmentNodeView } from './base-attachment-fallback-view';
import {
  type AttachmentNodeOptions,
  type AttachmentType,
  ALL_ATTACHMENT_NODE_NAMES,
  NODE_NAME_TO_TYPE,
} from './types';

/**
 * Type for NodeView components that can be passed to createAttachmentNode.
 * Uses NodeViewRendererProps for compatibility with ReactNodeViewRenderer.
 */
type NodeViewComponent = (props: NodeViewProps) => React.ReactElement | null;

/**
 * Base attributes shared by all attachment nodes.
 */
interface BaseAttrs {
  id: string;
  label: string;
}

/**
 * Configuration for creating an attachment node extension.
 */
export interface CreateAttachmentNodeConfig<TAttrs extends object = object> {
  /** The unique name for this node in the ProseMirror schema */
  name: string;
  /** The data attribute used to identify this node type in HTML (e.g., 'data-file-attachment') */
  dataTag: string;
  /** The markdown protocol prefix (e.g., 'path') */
  markdownProtocol: string;
  /** Additional attributes specific to this attachment type */
  additionalAttributes?: {
    [K in keyof TAttrs]?: {
      default: TAttrs[K] | null;
      parseHTML: (element: HTMLElement) => TAttrs[K] | null;
      renderHTML: (
        attributes: TAttrs,
      ) => Record<string, string | null | undefined>;
    };
  };
  /** Optional custom NodeView component. Falls back to shared AttachmentNodeView if not provided. */
  NodeView?: NodeViewComponent;
  /**
   * Optional custom renderText function for copy/paste and serialization.
   * Defaults to `@${node.attrs.id}` if not provided.
   */
  renderText?: (params: { node: { attrs: BaseAttrs & TAttrs } }) => string;
  /**
   * Optional override for converting a markdown token back into a ProseMirror
   * node. Defaults to storing `token.id` directly on `attrs.id`.
   */
  parseMarkdown?: (token: any) => {
    type: string;
    attrs: Record<string, unknown>;
  };
  /**
   * Optional override for serializing a ProseMirror node back to a markdown
   * link. Defaults to `[](markdownProtocol:node.attrs.id)`.
   */
  renderMarkdown?: (node: any) => string;
}

/**
 * Creates an attachment node extension with shared configuration.
 *
 * This factory function provides all the common behavior for attachment nodes:
 * - Inline, atomic, selectable, draggable configuration
 * - Common attributes (id, label)
 * - React node view rendering
 * - Deletion tracking via ProseMirror plugin
 *
 * @param config - Configuration for the specific attachment type
 * @returns A TipTap Node extension
 */
export function createAttachmentNode<TAttrs extends object = object>(
  config: CreateAttachmentNodeConfig<TAttrs>,
) {
  const {
    name,
    dataTag,
    markdownProtocol,
    additionalAttributes = {},
    NodeView,
    renderText: customRenderText,
    parseMarkdown: customParseMarkdown,
    renderMarkdown: customRenderMarkdown,
  } = config;

  return Node.create<AttachmentNodeOptions>({
    name,

    addOptions() {
      return {
        onNodeDeleted: undefined,
      };
    },

    group: 'inline',

    inline: true,

    // Atomic means the node cannot be edited internally - it's treated as a single unit
    atom: true,

    // Selectable allows the node to be selected as a whole
    selectable: true,

    // Draggable allows the node to be dragged
    draggable: true,

    addAttributes() {
      return {
        // Common attributes shared by all attachment types
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
        // Type-specific additional attributes
        ...additionalAttributes,
      };
    },

    parseHTML() {
      return [
        {
          tag: `span[${dataTag}]`,
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'span',
        mergeAttributes({ [dataTag]: '' }, HTMLAttributes),
        `@${HTMLAttributes['data-id'] || 'attachment'}`,
      ];
    },

    // Render the text representation for copy/paste and serialization
    renderText({ node }) {
      if (customRenderText) {
        return customRenderText({
          node: node as unknown as { attrs: BaseAttrs & TAttrs },
        });
      }
      return `@${node.attrs.id}`;
    },

    // Markdown support: Use a custom tokenizer to recognize our attachment link syntax
    // This runs during the lexing phase and creates custom tokens for our attachments
    markdownTokenizer: {
      name, // Use the node name as the token name
      level: 'inline' as const,
      // Start function helps the tokenizer find potential matches quickly
      start(src: string) {
        const pattern = `\\[\\]\\(${markdownProtocol}:`;
        const result = src.match(new RegExp(pattern))?.index ?? -1;
        return result;
      },
      // Tokenize function parses our custom link syntax
      tokenize(src: string) {
        // Match empty link syntax with our protocol: [](protocol:id)
        const pattern = `^\\[\\]\\(${markdownProtocol}:((?:[^()]|\\([^()]*\\))+)\\)`;
        const match = src.match(new RegExp(pattern));
        if (!match) return undefined;

        return {
          type: name, // This will be the token type that parseMarkdown receives
          raw: match[0], // The full matched string
          id: match[1], // Capture the ID from the protocol URL
        };
      },
    },

    // Parse the custom token created by our tokenizer
    parseMarkdown(token: any) {
      if (customParseMarkdown) return customParseMarkdown(token);
      return {
        type: name,
        attrs: {
          id: token.id as string,
          label: token.id as string, // Use ID as default label
        },
      };
    },

    // Markdown support: serialize attachment nodes back to markdown links
    renderMarkdown(node: any) {
      if (customRenderMarkdown) return customRenderMarkdown(node);
      return `[](${markdownProtocol}:${node.attrs.id})`;
    },

    addNodeView() {
      // Use custom NodeView if provided, otherwise fall back to shared AttachmentNodeView
      // Cast needed because NodeViewProps and ReactNodeViewRendererProps have slight type differences
      const ViewComponent = (NodeView ?? AttachmentNodeView) as Parameters<
        typeof ReactNodeViewRenderer
      >[0];
      return ReactNodeViewRenderer(ViewComponent);
    },

    addProseMirrorPlugins() {
      const { onNodeDeleted } = this.options;
      const thisNodeName = this.name;

      return [
        new Plugin({
          key: new PluginKey(`${thisNodeName}Deletion`),
          appendTransaction: (transactions, oldState, newState) => {
            if (!onNodeDeleted) return null;

            // Only process if document changed
            const docChanged = transactions.some((tr) => tr.docChanged);
            if (!docChanged) return null;

            // Collect attachment nodes from old and new states
            // We track ALL attachment node types to properly detect deletions
            const oldNodes = new Map<
              string,
              { type: AttachmentType; attrs: Record<string, unknown> }
            >();
            oldState.doc.descendants((node) => {
              if (ALL_ATTACHMENT_NODE_NAMES.includes(node.type.name as never)) {
                const type =
                  NODE_NAME_TO_TYPE[
                    node.type.name as keyof typeof NODE_NAME_TO_TYPE
                  ];
                if (type)
                  oldNodes.set(node.attrs.id, {
                    type,
                    attrs: node.attrs as Record<string, unknown>,
                  });
              }
            });

            const newNodeIds = new Set<string>();
            newState.doc.descendants((node) => {
              if (ALL_ATTACHMENT_NODE_NAMES.includes(node.type.name as never))
                newNodeIds.add(node.attrs.id);
            });

            // Fire callback for nodes that existed in old state but not in new state
            // Only fire once per deletion (use thisNodeName to ensure single callback)
            if (thisNodeName === ALL_ATTACHMENT_NODE_NAMES[0])
              oldNodes.forEach(({ type, attrs }, id) => {
                if (!newNodeIds.has(id)) onNodeDeleted(id, type, attrs);
              });

            return null; // Don't modify the transaction
          },
        }),
      ];
    },
  });
}
