import type { BaseNodeAttrs } from '../shared/types';

/**
 * Attributes for file attachments (unified node).
 */
export interface AttachmentAttrs extends BaseNodeAttrs {}

/**
 * Attributes for selected element attachments.
 */
export interface ElementAttachmentAttrs extends BaseNodeAttrs {
  /** Truncated inner text of the element (first ~60 chars) for display */
  innerText?: string;
  /** Blob key for the element screenshot (stored in att/) */
  screenshotBlobKey?: string;
  /** The tag name of the element (e.g. 'div', 'button') */
  tagName?: string;
  /**
   * Full `att/<blobKey>` path to the stored `.swdomelement` file.
   * Set asynchronously after the blob is written. When present,
   * `renderText` emits `[](path:<blobPath>)` so the model and
   * streamdown layer can locate the element data.
   */
  blobPath?: string;
}

/**
 * Union type for all attachment attributes with type discriminator.
 * Used for type-safe handling of different attachment types.
 */
export type AttachmentAttributes =
  | (AttachmentAttrs & { type: 'attachment' })
  | (ElementAttachmentAttrs & { type: 'element' });

export type AttachmentType = AttachmentAttributes['type'];

/**
 * Node type names used in the ProseMirror schema.
 * Maps from the attachment type to the node name.
 */
export const ATTACHMENT_NODE_NAMES = {
  attachment: 'attachment',
  element: 'elementAttachment',
} as const;

/**
 * Type for valid attachment node names.
 */
export type AttachmentNodeName =
  (typeof ATTACHMENT_NODE_NAMES)[keyof typeof ATTACHMENT_NODE_NAMES];

/**
 * Reverse mapping from node name to attachment type.
 */
export const NODE_NAME_TO_TYPE: Record<AttachmentNodeName, AttachmentType> = {
  attachment: 'attachment',
  elementAttachment: 'element',
};

/**
 * Array of all attachment node names for iteration.
 */
export const ALL_ATTACHMENT_NODE_NAMES = Object.values(
  ATTACHMENT_NODE_NAMES,
) as AttachmentNodeName[];

/**
 * Configuration options for attachment nodes.
 */
export interface AttachmentNodeOptions {
  /** Called when an attachment node is removed from the document */
  onNodeDeleted?: (
    id: string,
    type: AttachmentType,
    attrs?: Record<string, unknown>,
  ) => void;
}
