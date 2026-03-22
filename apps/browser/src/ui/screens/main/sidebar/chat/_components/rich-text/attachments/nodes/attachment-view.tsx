import { useMemo } from 'react';
import type { InlineNodeViewProps } from '../../shared/types';
import {
  getRenderer,
  resolveAttachmentBlobUrl,
} from '@ui/components/attachment-renderers';
import type { BadgeProps } from '@ui/components/attachment-renderers';
import { useMessageAttachments } from '@ui/hooks/use-message-elements';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { inferMimeType } from '@shared/mime-utils';

interface AttachmentAttrs {
  id: string;
  label: string;
}

export function AttachmentRegistryNodeView(props: InlineNodeViewProps) {
  const attrs = props.node.attrs as AttachmentAttrs;
  const isEditable = !('viewOnly' in props);
  const [openAgent] = useOpenAgent();

  const { attachments } = useMessageAttachments();
  const attachment = useMemo(
    () => attachments.find((a) => a.path === attrs.id),
    [attachments, attrs.id],
  );

  // attrs.id is the path (set at insertion time via attachmentToAttachmentAttributes).
  // attrs.label is the display name set at insertion time — used as fallback
  // when the attachment isn't in context yet (e.g. freshly added in composer).
  // Prefer originalFileName from the attachment registry, then the label set
  // at insertion time (which carries the original filename). Only fall back to
  // extracting from the raw path when neither is available.
  const displayName =
    attachment?.originalFileName ??
    attrs.label ??
    (attrs.id.startsWith('att/')
      ? (attrs.id.slice(4).split('/').pop() ?? attrs.id)
      : (attrs.id.split('/').pop() ?? attrs.id));
  const mediaType = inferMimeType(displayName);
  const blobUrl = resolveAttachmentBlobUrl(attrs.id, openAgent);

  const renderer = getRenderer(mediaType);

  const badgeProps: BadgeProps = {
    attachmentId: attrs.id,
    mediaType,
    fileName: displayName,
    sizeBytes: 0,
    blobUrl,
    params: {},
    viewOnly: !isEditable,
    selected: props.selected,
    onDelete: () => ('deleteNode' in props ? props.deleteNode() : undefined),
  };

  return <renderer.Badge {...badgeProps} />;
}
