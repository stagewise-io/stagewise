import { Extension } from '@tiptap/core';
import { Attachment } from './nodes/attachment';
import { ElementAttachment } from './nodes/element-attachment';

import {
  type AttachmentAttributes,
  type AttachmentNodeOptions,
  ATTACHMENT_NODE_NAMES,
} from './types';

// Types
export type {
  AttachmentAttributes,
  AttachmentType,
  AttachmentNodeOptions,
  AttachmentAttrs,
  ElementAttachmentAttrs,
  AttachmentNodeName,
} from './types';

export {
  ATTACHMENT_NODE_NAMES,
  NODE_NAME_TO_TYPE,
  ALL_ATTACHMENT_NODE_NAMES,
} from './types';

// Individual nodes
export { Attachment } from './nodes/attachment';
export { ElementAttachment } from './nodes/element-attachment';

// Node view components (used by TipTap and view-only renderer)
export { AttachmentRegistryNodeView } from './nodes/attachment-view';
export { ElementAttachmentView } from './nodes/element-attachment-view';

/**
 * Array of all attachment node extensions.
 * Use this to register all attachment types with the editor.
 */
export const AllAttachmentExtensions = [Attachment, ElementAttachment] as const;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    attachmentCommands: {
      insertAttachment: (
        attrs: AttachmentAttributes,
        position?: number,
      ) => ReturnType;
    };
  }
}

/**
 * Extension that provides a unified `insertAttachment` command.
 * Routes to the correct node type based on the attachment's `type` attribute.
 */
export const AttachmentCommands = Extension.create({
  name: 'attachmentCommands',

  addCommands() {
    return {
      insertAttachment:
        (attrs: AttachmentAttributes, position?: number) =>
        ({ chain, state }) => {
          const nodeName = ATTACHMENT_NODE_NAMES[attrs.type];
          const { type: _type, ...nodeAttrs } = attrs;
          const content = [
            {
              type: nodeName,
              attrs: nodeAttrs,
            },
            {
              type: 'text',
              text: ' ',
            },
          ];

          if (position !== undefined) {
            // Clamp to valid doc range. A freshly-cleared doc has
            // content.size === 2 (one empty paragraph: open+close tokens),
            // so positions 1..size-1 are the safe inline insertion points.
            // This guards against stale positions after the doc has been
            // shortened or cleared while an async blob-store call was
            // in flight.
            const max = Math.max(1, state.doc.content.size - 1);
            const safePos = Math.min(Math.max(position, 1), max);
            return chain().insertContentAt(safePos, content).run();
          }

          return chain().insertContent(content).run();
        },
    };
  },
});

/**
 * Configure all attachment extensions with the same options.
 */
export function configureAttachmentExtensions(options: AttachmentNodeOptions) {
  return [
    Attachment.configure(options),
    ElementAttachment.configure(options),
    AttachmentCommands,
  ];
}
