import type { InlineNodeViewProps } from '../shared/types';
import type { MentionAttrs } from './types';
import { FileContextMenu } from '@ui/components/file-context-menu';
import { useFileIDEHref } from '@ui/hooks/use-file-ide-href';
import { TabMentionBadge } from './tab-mention-badge';
import { FileReferenceBadge } from '@ui/components/file-reference-badge';

export function MentionNodeView(props: InlineNodeViewProps) {
  const attrs = props.node.attrs as MentionAttrs;
  const isEditable = !('viewOnly' in props);
  const isFile = attrs.providerType === 'file';
  const isTab = attrs.providerType === 'tab';
  const { resolvePath } = useFileIDEHref();

  if (isTab) {
    const tabMeta = attrs.meta?.providerType === 'tab' ? attrs.meta : null;
    return (
      <TabMentionBadge
        tabId={attrs.id}
        meta={tabMeta}
        selected={props.selected}
        isEditable={isEditable}
        onDelete={() =>
          'deleteNode' in props ? props.deleteNode() : undefined
        }
        viewOnly={!isEditable}
      />
    );
  }

  // File, workspace, and any unknown provider types all use FileReferenceBadge.
  // Workspace mentions use the mount prefix (e.g. "w1") as the id,
  // which FileReferenceBadge detects as a workspace-root (no `/`).
  const badge = (
    <FileReferenceBadge
      filePath={attrs.id}
      viewOnly={!isEditable}
      selected={props.selected}
      isEditable={isEditable}
      onDelete={() => ('deleteNode' in props ? props.deleteNode() : undefined)}
    />
  );

  // View-only file badges get the context menu for IDE-opening.
  if (isFile && !isEditable) {
    return (
      <FileContextMenu relativePath={attrs.id} resolvePath={resolvePath}>
        {badge}
      </FileContextMenu>
    );
  }

  return badge;
}
