import { useCallback } from 'react';
import type { InlineNodeViewProps } from '../shared/types';
import type { MentionAttrs } from './types';
import { FileContextMenu } from '@ui/components/file-context-menu';
import { TabMentionBadge } from './tab-mention-badge';
import { FileReferenceBadge } from '@ui/components/file-reference-badge';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useMountedPaths } from '@ui/hooks/use-mounted-paths';

function findLastMountByPrefix<T extends { prefix: string }>(
  mounts: readonly T[] | null,
  prefix: string,
): T | undefined {
  if (!mounts) return undefined;
  for (let index = mounts.length - 1; index >= 0; index--) {
    const mount = mounts[index];
    if (mount?.prefix === prefix) return mount;
  }
  return undefined;
}

export function MentionNodeView(props: InlineNodeViewProps) {
  const attrs = props.node.attrs as MentionAttrs;
  const isEditable = !('viewOnly' in props);
  const [openAgent] = useOpenAgent();
  const openFileTab = useKartonProcedure((p) => p.fileTree.openFileTab);
  const revealInFolder = useKartonProcedure((p) => p.fileTree.revealInFolder);
  const historicalMounts = useMountedPaths();
  const mounts = useKartonState((s) =>
    openAgent ? (s.toolbox[openAgent]?.workspace?.mounts ?? []) : [],
  );
  const isFile = attrs.providerType === 'file';
  const isTab = attrs.providerType === 'tab';
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

  const openFile = useCallback(() => {
    if (!isFile || !attrs.id.includes('/')) return;
    const slashIndex = attrs.id.indexOf('/');
    if (slashIndex <= 0) return;
    const prefix = attrs.id.slice(0, slashIndex);
    const relativePath = attrs.id.slice(slashIndex + 1);
    const mount =
      mounts.find((item) => item.prefix === prefix) ??
      findLastMountByPrefix(historicalMounts, prefix);
    if (!mount) return;
    const workspaceKey = `${mount.prefix}:${mount.path.replace(/\\/g, '/')}`;
    void openFileTab(workspaceKey, relativePath, openAgent).then((tabId) => {
      if (!tabId) void revealInFolder(workspaceKey, relativePath);
    });
  }, [
    attrs.id,
    isFile,
    mounts,
    historicalMounts,
    openAgent,
    openFileTab,
    revealInFolder,
  ]);

  // View-only file badges get click-to-open plus the context menu.
  if (isFile && !isEditable) {
    return (
      <FileContextMenu relativePath={attrs.id} onOpenFile={openFile}>
        <span
          className="inline cursor-pointer"
          role="link"
          tabIndex={0}
          onMouseDownCapture={(event) => event.stopPropagation()}
          onClickCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openFile();
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            openFile();
          }}
        >
          {badge}
        </span>
      </FileContextMenu>
    );
  }

  return badge;
}
