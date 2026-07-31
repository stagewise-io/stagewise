import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ToolCallFileEdit } from '@shared/karton-contracts/ui/shared-types';
import { normalizePath } from '@shared/path-utils';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { useMountedPaths } from '@ui/hooks/use-mounted-paths';
import { DiffButtonContent } from '@ui/components/diff-button-content';
import { DiffLineStats } from '@ui/components/diff-line-stats';
import { FileTreeNodeRow } from '@ui/components/file-tree-node-row';
import { Button } from '@stagewise/stage-ui/components/button';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { ListChevronsDownUpIcon, ListChevronsUpDownIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { resolveWorkspaceFileLocation } from '@ui/utils/workspace-path';
import {
  buildTurnFileTree,
  type TurnFileTreeNode,
} from './turn-file-edits-utils';
import { getFileTreeWorkspaceKey } from '../../../file-tree/file-tree-utils';
import { useContentCollapsed } from '../../../_components/content-collapsed-context';

const TURN_FILE_EDITS_CACHE_LIMIT = 200;

const turnFileEditsCache = new Map<string, ToolCallFileEdit[]>();
const turnFileEditsRequests = new Map<string, Promise<ToolCallFileEdit[]>>();

function setTurnFileEditsCache(key: string, edits: ToolCallFileEdit[]) {
  turnFileEditsCache.delete(key);
  turnFileEditsCache.set(key, edits);

  if (turnFileEditsCache.size > TURN_FILE_EDITS_CACHE_LIMIT) {
    const oldestKey = turnFileEditsCache.keys().next().value;
    if (oldestKey !== undefined) turnFileEditsCache.delete(oldestKey);
  }
}

function FileTreeRows({
  nodes,
  depth,
  collapsedFolders,
  onToggleFolder,
  onOpenFile,
}: {
  nodes: TurnFileTreeNode[];
  depth: number;
  collapsedFolders: Set<string>;
  onToggleFolder: (key: string) => void;
  onOpenFile: (edit: ToolCallFileEdit) => void;
}) {
  return nodes.map((node) => {
    if (node.type === 'folder') {
      const collapsed = collapsedFolders.has(node.key);
      return (
        <div key={node.key}>
          <FileTreeNodeRow
            kind="directory"
            name={node.name}
            depth={depth}
            expanded={!collapsed}
            onClick={() => onToggleFolder(node.key)}
            trailing={
              <DiffLineStats
                added={node.added}
                removed={node.removed}
                className="gap-1 text-[10px]"
              />
            }
          />
          {!collapsed && (
            <FileTreeRows
              nodes={node.children}
              depth={depth + 1}
              collapsedFolders={collapsedFolders}
              onToggleFolder={onToggleFolder}
              onOpenFile={onOpenFile}
            />
          )}
        </div>
      );
    }

    const externalLabel = node.edit.changeType
      ? node.edit.changeType === 'created'
        ? 'new'
        : node.edit.changeType
      : null;
    return (
      <FileTreeNodeRow
        key={node.edit.path}
        kind="file"
        name={node.name}
        depth={depth}
        title={node.edit.path}
        onClick={() => onOpenFile(node.edit)}
        trailing={
          externalLabel ? (
            <span className="text-[10px] text-subtle-foreground">
              {externalLabel}
            </span>
          ) : (
            <DiffLineStats
              added={node.edit.added}
              removed={node.edit.removed}
              className="gap-1 text-[10px]"
            />
          )
        }
      />
    );
  });
}

export function useTurnFileEdits(
  agentId: string,
  toolCallIds: string[],
  enabled: boolean,
): ToolCallFileEdit[] | null {
  const getFileEditsForToolCalls = useKartonProcedure(
    (procedures) => procedures.toolbox.getFileEditsForToolCalls,
  );
  const cacheKey = enabled ? JSON.stringify([agentId, toolCallIds]) : null;
  const cached = cacheKey ? turnFileEditsCache.get(cacheKey) : undefined;
  const [loaded, setLoaded] = useState<{
    key: string;
    edits: ToolCallFileEdit[];
  } | null>(null);

  useEffect(() => {
    if (!cacheKey) return;

    let cancelled = false;
    const cachedResult = turnFileEditsCache.get(cacheKey);
    if (cachedResult) {
      setTurnFileEditsCache(cacheKey, cachedResult);
      return;
    }

    let request = turnFileEditsRequests.get(cacheKey);
    if (!request) {
      request = getFileEditsForToolCalls(agentId, toolCallIds);
      turnFileEditsRequests.set(cacheKey, request);
      void request.then(
        (result) => {
          if (turnFileEditsRequests.get(cacheKey) === request) {
            turnFileEditsRequests.delete(cacheKey);
            setTurnFileEditsCache(cacheKey, result);
          }
        },
        () => {
          if (turnFileEditsRequests.get(cacheKey) === request) {
            turnFileEditsRequests.delete(cacheKey);
          }
        },
      );
    }

    void request.then(
      (result) => {
        if (!cancelled) setLoaded({ key: cacheKey, edits: result });
      },
      () => {
        if (!cancelled) setLoaded({ key: cacheKey, edits: [] });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [agentId, cacheKey, getFileEditsForToolCalls, toolCallIds]);

  if (!cacheKey) return null;
  if (cached) return cached;
  return loaded?.key === cacheKey ? loaded.edits : null;
}

export const TurnFileEdits = memo(function TurnFileEdits({
  agentId,
  edits,
}: {
  agentId: string;
  edits: ToolCallFileEdit[];
}) {
  const mounts = useMountedPaths();
  const { setCollapsed: setContentCollapsed } = useContentCollapsed();
  const setFileTreeVisible = useKartonProcedure(
    (procedures) => procedures.fileTree.setVisible,
  );
  const setActiveWorkspace = useKartonProcedure(
    (procedures) => procedures.fileTree.setActiveWorkspace,
  );
  const setFileTreeViewMode = useKartonProcedure(
    (procedures) => procedures.fileTree.setViewMode,
  );
  const getWorkspaceDiffSummary = useKartonProcedure(
    (procedures) => procedures.toolbox.getWorkspaceDiffSummary,
  );
  const openFileTab = useKartonProcedure(
    (procedures) => procedures.fileTree.openFileTab,
  );

  const openFileDiff = useCallback(
    async (edit: ToolCallFileEdit) => {
      const location = resolveWorkspaceFileLocation(edit.path, mounts ?? []);
      if (!location) return;
      const workspaceKey = getFileTreeWorkspaceKey(location.mount);
      setContentCollapsed(false);

      try {
        const [summary] = await Promise.all([
          getWorkspaceDiffSummary(location.mount.path),
          setFileTreeVisible(true),
          setActiveWorkspace(workspaceKey),
          setFileTreeViewMode('diff'),
        ]);
        const entry = summary?.entries.find(
          (candidate) =>
            normalizePath(candidate.path) === location.relativePath,
        );
        if (!entry || entry.changeType === 'deleted') return;

        await openFileTab(workspaceKey, entry.path, agentId, {
          showDiff: true,
          diffStaged: entry.staged,
          diffOldPath: entry.oldPath,
        });
      } catch {
        // The sidebar still opens when no current Git diff can be loaded.
      }
    },
    [
      agentId,
      getWorkspaceDiffSummary,
      mounts,
      openFileTab,
      setActiveWorkspace,
      setContentCollapsed,
      setFileTreeViewMode,
      setFileTreeVisible,
    ],
  );

  const tree = useMemo(
    () => buildTurnFileTree(edits, mounts ?? []),
    [edits, mounts],
  );
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const allCollapsed =
    tree.folderKeys.length > 0 &&
    tree.folderKeys.every((key) => collapsedFolders.has(key));

  if (tree.nodes.length === 0) return null;

  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-derived-subtle bg-background shadow-elevation-1">
      <header className="flex min-h-10 items-center gap-2 border-derived-subtle border-b py-2 pr-2 pl-2.5">
        <span className="min-w-0 truncate font-medium text-muted-foreground text-xs">
          Changed files
          <span className="ml-1 font-normal text-subtle-foreground">
            {edits.length}
          </span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          {tree.folderKeys.length > 0 && (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={allCollapsed ? 'Expand all' : 'Collapse all'}
                  onClick={() =>
                    setCollapsedFolders(
                      allCollapsed ? new Set() : new Set(tree.folderKeys),
                    )
                  }
                >
                  {allCollapsed ? (
                    <ListChevronsUpDownIcon className="size-3.5" />
                  ) : (
                    <ListChevronsDownUpIcon className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="secondary"
            size="xs"
            className="rounded-full"
            onClick={() => {
              void setFileTreeVisible(true);
              void setFileTreeViewMode('diff');
            }}
          >
            <DiffButtonContent added={tree.added} removed={tree.removed} />
          </Button>
        </div>
      </header>
      <OverlayScrollbar
        className="max-h-72"
        viewportClassName="scroll-fade-y scroll-fade-4"
        contentClassName="p-1"
        options={{ overflow: { x: 'hidden', y: 'scroll' } }}
      >
        <FileTreeRows
          nodes={tree.nodes}
          depth={0}
          collapsedFolders={collapsedFolders}
          onOpenFile={(edit) => void openFileDiff(edit)}
          onToggleFolder={(key) =>
            setCollapsedFolders((current) => {
              const next = new Set(current);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
        />
      </OverlayScrollbar>
    </section>
  );
});
