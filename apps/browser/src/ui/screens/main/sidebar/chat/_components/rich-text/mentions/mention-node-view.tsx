import { useMemo } from 'react';
import type { InlineNodeViewProps } from '../shared/types';
import type { MentionAttrs } from './types';
import { truncateLabel, InlineBadge, InlineBadgeWrapper } from '../shared';
import { MentionIcon } from './mention-icon';
import { stripMountPrefix } from '@ui/utils';
import { FileContextMenu } from '@ui/components/file-context-menu';
import { useFileIDEHref } from '@ui/hooks/use-file-ide-href';
import { TabMentionBadge } from './tab-mention-badge';
import { WorkspaceMentionBadge } from './workspace-mention-badge';

export function MentionNodeView(props: InlineNodeViewProps) {
  const attrs = props.node.attrs as MentionAttrs;
  const isEditable = !('viewOnly' in props);
  const isFile = attrs.providerType === 'file';
  const isTab = attrs.providerType === 'tab';
  const isWorkspace = attrs.providerType === 'workspace';
  const { resolvePath } = useFileIDEHref();

  const displayLabel = useMemo(
    () => truncateLabel(attrs.label, attrs.id),
    [attrs.label, attrs.id],
  );

  const tooltipContent = useMemo(
    () => (isFile ? stripMountPrefix(attrs.id) : attrs.id),
    [attrs.id, isFile],
  );

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

  if (isWorkspace) {
    const wsMeta = attrs.meta?.providerType === 'workspace' ? attrs.meta : null;
    return (
      <WorkspaceMentionBadge
        prefix={attrs.id}
        meta={wsMeta}
        selected={props.selected}
        isEditable={isEditable}
        onDelete={() =>
          'deleteNode' in props ? props.deleteNode() : undefined
        }
        viewOnly={!isEditable}
      />
    );
  }

  const badge = (
    <InlineBadgeWrapper viewOnly={!isEditable} tooltipContent={tooltipContent}>
      <InlineBadge
        icon={<MentionIcon providerType={attrs.providerType} id={attrs.id} />}
        label={displayLabel}
        selected={props.selected}
        isEditable={isEditable}
        onDelete={() =>
          'deleteNode' in props ? props.deleteNode() : undefined
        }
      />
    </InlineBadgeWrapper>
  );

  if (isFile && !isEditable) {
    return (
      <FileContextMenu relativePath={attrs.id} resolvePath={resolvePath}>
        {badge}
      </FileContextMenu>
    );
  }

  return badge;
}
