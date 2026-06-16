import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { cn } from '@ui/utils';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { XIcon, GitBranchIcon } from 'lucide-react';
import type { MountedWorkspaceGitDiffSummary } from '@shared/karton-contracts/ui';
import {
  IconFileSearchOutline18,
  IconFolder5Outline18,
  IconFolderSearchOutline18,
} from 'nucleo-ui-outline-18';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HotkeyActions } from '@shared/hotkeys';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import { useCommandCenter } from '../command-center';
import { FileTreePreviewCoordinator } from './file-tree-preview-coordinator';
import { FileTreeWorkspaceView } from './file-tree-workspace-view';
import { FileTreeDiffView } from './file-tree-diff-view';
import {
  getFileTreeWorkspaceKey,
  getFileTreeWorkspaceMountsForAgent,
  getFileTreeWorkspaceName,
} from './file-tree-utils';
import { Tutorial } from '@ui/components/tutorial';

function areFileTreeWorkspaceMountsEqual(
  a: ReturnType<typeof getFileTreeWorkspaceMountsForAgent>,
  b: ReturnType<typeof getFileTreeWorkspaceMountsForAgent>,
): boolean {
  return (
    a.length === b.length &&
    a.every((mount, index) => {
      const otherMount = b[index];
      return (
        otherMount !== undefined &&
        getFileTreeWorkspaceKey(mount) === getFileTreeWorkspaceKey(otherMount)
      );
    })
  );
}

export function FileTreeSidebar() {
  const [openAgent] = useOpenAgent();
  const workspaceMounts = useKartonState(
    useComparingSelector(
      (s) => getFileTreeWorkspaceMountsForAgent(s, openAgent),
      areFileTreeWorkspaceMountsEqual,
    ),
  );
  const activeWorkspaceKey = useKartonState(
    (s) => s.fileTree.activeWorkspaceKey,
  );
  const viewMode = useKartonState((s) => s.fileTree.viewMode);
  const setVisible = useKartonProcedure((p) => p.fileTree.setVisible);
  const setActiveWorkspace = useKartonProcedure(
    (p) => p.fileTree.setActiveWorkspace,
  );
  const setViewMode = useKartonProcedure((p) => p.fileTree.setViewMode);
  const getWorkspaceDiffSummary = useKartonProcedure(
    (p) => p.toolbox.getWorkspaceDiffSummary,
  );
  const { open: openCommandCenter } = useCommandCenter();
  const [previewTargetPath, setPreviewTargetPath] = useState<string | null>(
    null,
  );
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [diffData, setDiffData] =
    useState<MountedWorkspaceGitDiffSummary | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const diffTotals = useMemo(
    () => ({
      added: diffData?.totalAdded ?? 0,
      deleted: diffData?.totalDeleted ?? 0,
    }),
    [diffData],
  );

  const workspaces = useMemo(
    () =>
      workspaceMounts.map((mount) => ({
        key: getFileTreeWorkspaceKey(mount),
        name: getFileTreeWorkspaceName(mount),
        path: mount.path,
      })),
    [workspaceMounts],
  );
  const selectedWorkspaceKey = workspaces.some(
    (workspace) => workspace.key === activeWorkspaceKey,
  )
    ? activeWorkspaceKey
    : (workspaces[0]?.key ?? null);

  const selectedWorkspacePath =
    workspaces.find((ws) => ws.key === selectedWorkspaceKey)?.path ?? null;

  // Subscribe to workspace revisions so the diff view re-fetches when
  // files change (agent edits, external writes, etc.).
  const workspaceRevision = useKartonState((s) =>
    selectedWorkspaceKey
      ? (s.fileTree.workspaceRevisions[selectedWorkspaceKey] ?? 0)
      : 0,
  );

  useEffect(() => {
    if (selectedWorkspaceKey !== activeWorkspaceKey) {
      void setActiveWorkspace(selectedWorkspaceKey);
    }
  }, [activeWorkspaceKey, selectedWorkspaceKey, setActiveWorkspace]);

  // Fetch diff summary when workspace changes
  useEffect(() => {
    let cancelled = false;
    if (!selectedWorkspacePath) {
      setIsGitRepo(false);
      setDiffData(null);
      return;
    }
    setDiffLoading(true);
    getWorkspaceDiffSummary(selectedWorkspacePath)
      .then((result) => {
        if (cancelled) return;
        setIsGitRepo(result !== null);
        setDiffData(result);
        if (!result) {
          void setViewMode('files');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsGitRepo(false);
          setDiffData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWorkspacePath, workspaceRevision]);

  useEffect(() => {
    setPreviewTargetPath(null);
  }, []);

  const handlePreviewTargetChange = useCallback(
    (relativePath: string | null) => {
      setPreviewTargetPath(relativePath);
    },
    [],
  );

  const handlePreviewTargetClose = useCallback(() => {
    setPreviewTargetPath(null);
  }, []);

  const openFileSearch = useCallback(
    (searchInContent: boolean) => {
      openCommandCenter({
        initialMode: 'files',
        initialSearchInContent: searchInContent,
        initialFileWorkspaceKeys: selectedWorkspaceKey
          ? [selectedWorkspaceKey]
          : undefined,
      });
    },
    [openCommandCenter, selectedWorkspaceKey],
  );

  const openFileTab = useKartonProcedure((p) => p.fileTree.openFileTab);

  const shownRelativePath = useKartonState((s) => {
    const activeTabId = s.contentTabs.activeTabId;
    if (!activeTabId || !selectedWorkspaceKey) return null;
    const file = s.contentTabs.tabs[activeTabId]?.file;
    return file?.workspaceKey === selectedWorkspaceKey
      ? file.relativePath
      : null;
  });

  const handleDiffOpenFile = useCallback(
    (path: string) => {
      if (!selectedWorkspaceKey) return;
      void openFileTab(selectedWorkspaceKey, path, openAgent);
    },
    [openFileTab, selectedWorkspaceKey, openAgent],
  );

  const previewGroupKey = `file-tree-preview:${openAgent ?? 'global'}`;

  return (
    <aside
      data-tutorial="file-tree-panel"
      className="flex h-full w-full flex-col bg-background"
    >
      <div
        className={cn(
          'flex shrink-0 flex-row items-stretch gap-1 bg-background p-1.5 pr-2.5',
          workspaces.length > 0 && 'border-derived-strong border-b',
        )}
      >
        <div
          data-tutorial="file-tree-workspace-tabs"
          className="flex min-w-0 flex-1 flex-row items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {workspaces.map((workspace) => {
            const active = workspace.key === selectedWorkspaceKey;
            return (
              <button
                key={workspace.key}
                type="button"
                className={cn(
                  'app-no-drag group relative flex h-7 min-w-12 max-w-44 shrink cursor-pointer select-none flex-row items-center rounded-md bg-transparent px-2 py-0.5 text-xs transition-colors duration-150 ease-out hover:bg-surface-1',
                  active && 'bg-surface-1',
                )}
                title={workspace.path}
                onClick={() => setActiveWorkspace(workspace.key)}
              >
                <span
                  data-active={active}
                  className="min-w-0 flex-1 truncate text-left font-regular text-muted-foreground data-[active=true]:text-foreground"
                >
                  {workspace.name}
                </span>
              </button>
            );
          })}
        </div>
        <Tooltip>
          <TooltipTrigger>
            <Button
              className="size-7 shrink-0"
              variant="ghost"
              size="icon-sm"
              aria-label="Hide file tree"
              onClick={() => setVisible(false)}
            >
              <XIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span className="flex items-center gap-1.5">
              <span>Hide file tree</span>
              <HotkeyCombo action={HotkeyActions.TOGGLE_FILE_TREE} size="xs" />
            </span>
          </TooltipContent>
        </Tooltip>
      </div>
      {workspaces.length > 0 && <Tutorial tutorialId="file-tree" />}
      {workspaces.length > 0 && (
        <div
          data-tutorial="file-tree-search-bar"
          className="flex min-h-9 shrink-0 items-center justify-between gap-0.5 border-derived-strong border-b bg-background pr-1.5 pl-2"
        >
          {/* Files / Diff tab toggle */}
          <div className="flex h-7 items-center rounded-md bg-surface-1 p-0.5">
            <Tooltip>
              <TooltipTrigger>
                <button
                  type="button"
                  className={cn(
                    'flex h-full items-center gap-1 rounded px-2.5 text-xs transition-colors hover:text-foreground',
                    viewMode === 'files'
                      ? 'bg-background text-foreground ring-1 ring-border-subtle'
                      : 'text-muted-foreground',
                  )}
                  onClick={() => setViewMode('files')}
                >
                  <IconFolder5Outline18 className="size-3.5" />
                  {viewMode === 'files' && <span>Files</span>}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <span className="flex items-center gap-1.5">
                  <span>Files</span>
                  <HotkeyCombo
                    action={HotkeyActions.TOGGLE_FILE_TREE_FILES}
                    size="xs"
                  />
                </span>
              </TooltipContent>
            </Tooltip>
            {isGitRepo && (
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    className={cn(
                      'flex h-full items-center gap-1 rounded pl-2.5 text-xs transition-colors hover:text-foreground',
                      diffTotals.added > 0 || diffTotals.deleted > 0
                        ? 'pr-2'
                        : 'pr-2.5',
                      viewMode === 'diff'
                        ? 'bg-background text-foreground ring-1 ring-border-subtle'
                        : 'text-muted-foreground',
                    )}
                    onClick={() => setViewMode('diff')}
                  >
                    <GitBranchIcon className="size-3.5" />
                    {viewMode === 'diff' && <span>Diff</span>}
                    {(diffTotals.added > 0 || diffTotals.deleted > 0) && (
                      <span className="flex flex-col font-mono text-[0.5rem] tabular-nums leading-none">
                        <span className="text-success-foreground">
                          +{diffTotals.added}
                        </span>
                        <span className="text-error-foreground">
                          -{diffTotals.deleted}
                        </span>
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="flex items-center gap-1.5">
                    <span>Changed files</span>
                    <HotkeyCombo
                      action={HotkeyActions.TOGGLE_FILE_TREE_DIFF}
                      size="xs"
                    />
                  </span>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger>
                <Button
                  className="size-7 shrink-0"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Search in content"
                  onClick={() => openFileSearch(true)}
                >
                  <IconFileSearchOutline18 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span className="flex items-center gap-1.5">
                  <span>Search in content</span>
                  <HotkeyCombo
                    action={HotkeyActions.OPEN_CONTENT_FILE_SEARCH}
                    size="xs"
                  />
                </span>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  className="size-7 shrink-0"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Search files"
                  onClick={() => openFileSearch(false)}
                >
                  <IconFolderSearchOutline18 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span className="flex items-center gap-1.5">
                  <span>Search for files</span>
                  <HotkeyCombo
                    action={HotkeyActions.OPEN_FILE_SEARCH}
                    size="xs"
                  />
                </span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
      <FileTreePreviewCoordinator
        workspaceKey={selectedWorkspaceKey}
        previewTargetPath={previewTargetPath}
        groupKey={previewGroupKey}
        onPreviewTargetClose={handlePreviewTargetClose}
      />
      <div className="min-h-0 flex-1 pt-1">
        {viewMode === 'diff' ? (
          <FileTreeDiffView
            workspaceKey={selectedWorkspaceKey}
            data={diffData}
            loading={diffLoading}
            shownRelativePath={shownRelativePath}
            onOpenFile={handleDiffOpenFile}
          />
        ) : (
          <FileTreeWorkspaceView
            workspaceKey={selectedWorkspaceKey}
            onPreviewTargetChange={handlePreviewTargetChange}
          />
        )}
      </div>
    </aside>
  );
}
