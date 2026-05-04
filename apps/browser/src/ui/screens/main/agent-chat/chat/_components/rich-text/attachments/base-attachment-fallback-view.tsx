import { FileIcon } from 'lucide-react';
import { useMemo } from 'react';
import { truncateLabel, InlineBadge, InlineBadgeWrapper } from '../shared';
import type { InlineNodeViewProps, BaseNodeAttrs } from '../shared/types';
import { useMessageAttachments } from '@ui/hooks/use-message-elements';

/**
 * AttachmentNodeView is the default view component for attachment nodes.
 * It renders an attachment as an inline badge with an icon, truncated label,
 * and X button on hover for removal.
 *
 * This view handles file and image attachment types. Attachment types with
 * more complex rendering needs (like element attachments) should define
 * their own custom NodeView component.
 *
 * Note: Node deletion notifications are handled at the ProseMirror plugin level
 * in base-attachment-node.ts, not here. This component is purely presentational.
 */
export function AttachmentNodeView(props: InlineNodeViewProps) {
  const attrs = props.node.attrs as BaseNodeAttrs;
  const isEditable = !('viewOnly' in props);

  const { attachments } = useMessageAttachments();
  const attachment = useMemo(
    () => attachments.find((a) => a.path === attrs.id),
    [attachments, attrs.id],
  );

  // Display name: originalFileName for att/ blobs, basename for workspace paths,
  // or the attrs.label set at insertion time as final fallback.
  const label =
    attachment?.originalFileName ??
    (attachment
      ? (attachment.path.split('/').pop() ?? attachment.path)
      : null) ??
    attrs.label;

  const displayLabel = useMemo(
    () => truncateLabel(label, attrs.id),
    [label, attrs.id],
  );

  const typeIcon = <FileIcon className="size-3 shrink-0" />;

  const previewContent = useMemo(() => {
    return <span>{label}</span>;
  }, [label]);

  return (
    <InlineBadgeWrapper viewOnly={!isEditable} tooltipContent={previewContent}>
      <InlineBadge
        icon={typeIcon}
        label={displayLabel}
        selected={props.selected}
        isEditable={isEditable}
        onDelete={() =>
          'deleteNode' in props ? props.deleteNode() : undefined
        }
      />
    </InlineBadgeWrapper>
  );
}
