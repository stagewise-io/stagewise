import { useCallback, useMemo } from 'react';
import type { InlineNodeViewProps } from '../../shared/types';
import {
  getRenderer,
  resolveAttachmentBlobUrl,
} from '@ui/components/attachment-renderers';
import type { BadgeProps } from '@ui/components/attachment-renderers';
import { useMessageAttachments } from '@ui/hooks/use-message-elements';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { inferMimeType } from '@shared/mime-utils';

interface AttachmentAttrs {
  id: string;
  label: string;
}

export function AttachmentRegistryNodeView(props: InlineNodeViewProps) {
  const attrs = props.node.attrs as AttachmentAttrs;
  const isEditable = !('viewOnly' in props);
  const [openAgent] = useOpenAgent();
  const openFileTab = useKartonProcedure((p) => p.fileTree.openFileTab);
  const revealInFolder = useKartonProcedure((p) => p.fileTree.revealInFolder);
  const mounts = useKartonState((s) =>
    openAgent ? (s.toolbox[openAgent]?.workspace.mounts ?? []) : [],
  );

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
  const openWorkspaceFile = useCallback(() => {
    if (!attrs.id.includes('/') || attrs.id.startsWith('att/')) return;
    const slashIndex = attrs.id.indexOf('/');
    const prefix = attrs.id.slice(0, slashIndex);
    const relativePath = attrs.id.slice(slashIndex + 1);
    const mount = mounts.find((item) => item.prefix === prefix);
    if (!mount) return;

    const workspaceKey = `${mount.prefix}:${mount.path.replace(/\\/g, '/')}`;
    void openFileTab(workspaceKey, relativePath, openAgent).then((tabId) => {
      if (!tabId) void revealInFolder(workspaceKey, relativePath);
    });
  }, [attrs.id, mounts, openAgent, openFileTab, revealInFolder]);

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

  return (
    <span
      className="inline cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={openWorkspaceFile}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openWorkspaceFile();
        }
      }}
    >
      <renderer.Badge {...badgeProps} />
    </span>
  );
}
