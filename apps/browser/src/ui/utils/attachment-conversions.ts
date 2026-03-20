import type { SelectedElement } from '@shared/selected-elements';
import { generateId } from '@ui/utils';
import type { Attachment } from '@shared/karton-contracts/ui/agent/metadata';
import type { AttachmentAttributes } from '@ui/screens/main/sidebar/chat/_components/rich-text/attachments';

/**
 * Convert an Attachment to AttachmentAttributes for TipTap editor insertion.
 * The TipTap node stores `id` = path and `label` = display name.
 */
export function attachmentToAttachmentAttributes(
  attachment: Attachment,
): AttachmentAttributes {
  const displayName =
    attachment.originalFileName ??
    attachment.path.split('/').pop() ??
    attachment.path;
  return {
    id: attachment.path,
    type: 'attachment',
    label: displayName,
  };
}

/**
 * Convert a SelectedElement to AttachmentAttributes for TipTap editor insertion.
 */
export function selectedElementToAttachmentAttributes(
  element: SelectedElement,
): AttachmentAttributes {
  const tagName = (element.nodeType || element.tagName).toLowerCase();
  const domId = element.attributes?.id ? `#${element.attributes.id}` : '';
  const label = `${tagName}${domId}`;

  return {
    id: element.stagewiseId ?? generateId(),
    type: 'element',
    label,
  };
}
