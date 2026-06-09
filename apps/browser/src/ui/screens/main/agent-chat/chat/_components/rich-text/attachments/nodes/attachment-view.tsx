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
  const openAttachmentTab = useKartonProcedure(
    (p) => p.fileTree.openAttachmentTab,
  );
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
  const Badge = renderer.Badge;
  const openFile = useCallback(() => {
    // Agent attachment blobs (`att/<blobKey>`) open as read-only tabs. The
    // backend resolves the per-agent blob directory, so only the agent id
    // and blob id are needed here.
    if (attrs.id.startsWith('att/')) {
      if (!openAgent) return;
      const attachmentId = attrs.id.slice('att/'.length);
      if (!attachmentId) return;
      void openAttachmentTab(openAgent, attachmentId, displayName, openAgent);
      return;
    }
    if (!attrs.id.includes('/')) return;
    const slashIndex = attrs.id.indexOf('/');
    const prefix = attrs.id.slice(0, slashIndex);
    const relativePath = attrs.id.slice(slashIndex + 1);
    const mount = mounts.find((item) => item.prefix === prefix);
    // Even when the originating workspace is no longer mounted, the backend
    // can reconstruct the location from the workspace key, so fall back to a
    // key derived from the attachment path's prefix.
    const workspaceKey = mount
      ? `${mount.prefix}:${mount.path.replace(/\\/g, '/')}`
      : null;
    if (!workspaceKey) return;
    void openFileTab(workspaceKey, relativePath, openAgent).then((tabId) => {
      if (!tabId) void revealInFolder(workspaceKey, relativePath);
    });
  }, [
    attrs.id,
    displayName,
    mounts,
    openAgent,
    openAttachmentTab,
    openFileTab,
    revealInFolder,
  ]);

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

  // In the editor (editable mode) the node view's root element MUST be the
  // NodeViewWrapper that `Badge` renders internally — wrapping it in another
  // element breaks TipTap's node-view contract ("Please use the
  // NodeViewWrapper component for your node view."). Only the view-only
  // renderer (chat history) uses a plain <span> root, so the click-to-open
  // wrapper is safe there.
  if (isEditable) {
    return <Badge {...badgeProps} />;
  }

  const canOpenFile =
    (attrs.id.startsWith('att/') && attrs.id.length > 'att/'.length) ||
    (attrs.id.includes('/') && !attrs.id.startsWith('att/'));

  return (
    <span
      className={canOpenFile ? 'inline cursor-pointer' : 'inline'}
      role={canOpenFile ? 'button' : undefined}
      tabIndex={canOpenFile ? 0 : undefined}
      onClick={(event) => {
        if (!canOpenFile) return;
        // Stop the click from bubbling to the parent user-message bubble,
        // which would otherwise enter message-edit mode instead of opening
        // the file preview.
        event.preventDefault();
        event.stopPropagation();
        openFile();
      }}
      onKeyDown={(event) => {
        if (!canOpenFile) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          openFile();
        }
      }}
    >
      <Badge {...badgeProps} />
    </span>
  );
}
