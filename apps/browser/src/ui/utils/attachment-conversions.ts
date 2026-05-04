import type { SelectedElement } from '@shared/selected-elements';
import { generateId } from '@ui/utils';
import type { AttachmentMetadata } from '@shared/karton-contracts/ui/agent/metadata';
import type { AttachmentAttributes } from '@ui/screens/main/agent-chat/chat/_components/rich-text/attachments';

/**
 * Convert an Attachment to AttachmentAttributes for TipTap editor insertion.
 * The TipTap node stores `id` = path and `label` = display name.
 */
export function attachmentToAttachmentAttributes(
  attachment: AttachmentMetadata,
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

const MAX_INNER_TEXT_ATTR = 60;

/**
 * Convert a SelectedElement to AttachmentAttributes for TipTap editor insertion.
 */
export function selectedElementToAttachmentAttributes(
  element: SelectedElement,
): AttachmentAttributes {
  const tagName = (element.nodeType || element.tagName).toLowerCase();
  const domId = element.attributes?.id ? `#${element.attributes.id}` : '';
  const label = `${tagName}${domId}`;
  const trimmedText = element.innerText?.trim().slice(0, MAX_INNER_TEXT_ATTR);

  return {
    id: element.stagewiseId ?? generateId(),
    type: 'element',
    label,
    innerText: trimmedText || undefined,
    tagName,
  };
}
