import type { BaseNodeAttrs } from '../shared/types';

/**
 * Attributes for file attachments (unified node).
 */
export interface AttachmentAttrs extends BaseNodeAttrs {}

/**
 * Attributes for selected element attachments.
 */
export interface ElementAttachmentAttrs extends BaseNodeAttrs {}

/**
 * Attributes for text clip attachments (collapsed long text).
 */
export interface TextClipAttachmentAttrs extends BaseNodeAttrs {
  /**
   * The full pasted text content.
   * Optional in stored content (stripped to avoid duplication), required at runtime.
   * When rendering/editing, look up from textClipAttachments if not present.
   */
  content?: string;
}

/**
 * Union type for all attachment attributes with type discriminator.
 * Used for type-safe handling of different attachment types.
 */
export type AttachmentAttributes =
  | (AttachmentAttrs & { type: 'attachment' })
  | (ElementAttachmentAttrs & { type: 'element' })
  | (TextClipAttachmentAttrs & { type: 'textClip' });

export type AttachmentType = AttachmentAttributes['type'];

/**
 * Node type names used in the ProseMirror schema.
 * Maps from the attachment type to the node name.
 */
export const ATTACHMENT_NODE_NAMES = {
  attachment: 'attachment',
  element: 'elementAttachment',
  textClip: 'textClipAttachment',
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
  textClipAttachment: 'textClip',
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
  onNodeDeleted?: (id: string, type: AttachmentType) => void;
}
