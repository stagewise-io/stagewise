import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@ui/utils';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { SearchIcon, XIcon } from 'lucide-react';
import {
  IconCodeBranchOutline18,
  IconFolder5Outline18,
} from 'nucleo-ui-outline-18';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCommandCenter } from '../command-center';
import { FileTreePreviewCoordinator } from './file-tree-preview-coordinator';
import { FileTreeWorkspaceView } from './file-tree-workspace-view';
import {
  getFileTreeWorkspaceKey,
  getFileTreeWorkspaceMountsForAgent,
  getFileTreeWorkspaceName,
} from './file-tree-utils';

export function FileTreeSidebar() {
  const [openAgent] = useOpenAgent();
  const workspaceMounts = useKartonState(
    useComparingSelector((s) =>
      getFileTreeWorkspaceMountsForAgent(s, openAgent),
    ),
  );
  const activeWorkspaceKey = useKartonState(
    (s) => s.fileTree.activeWorkspaceKey,
  );
  const setVisible = useKartonProcedure((p) => p.fileTree.setVisible);
  const setActiveWorkspace = useKartonProcedure(
    (p) => p.fileTree.setActiveWorkspace,
  );
  const { open: openCommandCenter } = useCommandCenter();
  const [previewTargetPath, setPreviewTargetPath] = useState<string | null>(
    null,
  );
  const [mode, setMode] = useState<'files' | 'git-diff'>('files');

  const workspaces = useMemo(
    () =>
      workspaceMounts.map((mount) => ({
        key: getFileTreeWorkspaceKey(mount),
        name: getFileTreeWorkspaceName(mount),
        path: mount.path,
        git: mount.git,
      })),
    [workspaceMounts],
  );
  const selectedWorkspaceKey = workspaces.some(
    (workspace) => workspace.key === activeWorkspaceKey,
  )
    ? activeWorkspaceKey
    : (workspaces[0]?.key ?? null);

  useEffect(() => {
    if (selectedWorkspaceKey !== activeWorkspaceKey) {
      void setActiveWorkspace(selectedWorkspaceKey);
    }
  }, [activeWorkspaceKey, selectedWorkspaceKey, setActiveWorkspace]);

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

  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.key === selectedWorkspaceKey,
  );
  const gitDiffAvailable = selectedWorkspace?.git !== null;

  useEffect(() => {
    if (!gitDiffAvailable && mode === 'git-diff') setMode('files');
  }, [gitDiffAvailable, mode]);

  const previewGroupKey = `file-tree-preview:${openAgent ?? 'global'}`;

  return (
    <aside className="flex h-full w-full flex-col bg-background">
      <div className="flex shrink-0 flex-row items-stretch gap-1 border-derived-strong border-b bg-background p-1.5 pr-1">
        <div className="flex min-w-0 flex-1 flex-row items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {workspaces.map((workspace) => {
            const active = workspace.key === selectedWorkspaceKey;
            return (
              <button
                key={workspace.key}
                type="button"
                className={cn(
                  'group relative flex h-7 min-w-12 max-w-44 shrink cursor-pointer select-none flex-row items-center rounded-md bg-transparent px-2 py-0.5 text-xs transition-colors duration-150 ease-out hover:bg-surface-1',
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
        <Button
          className="size-7 shrink-0"
          variant="ghost"
          size="icon-sm"
          aria-label="Hide file tree"
          onClick={() => setVisible(false)}
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="flex h-9 shrink-0 items-center justify-between border-derived-strong border-b bg-background px-1.5">
        <div className="flex h-7 items-center gap-1 rounded-md bg-surface-1 p-0.5">
          <button
            type="button"
            className={cn(
              'flex h-full items-center gap-1 rounded px-2.5 text-muted-foreground text-xs transition-colors hover:text-foreground',
              mode === 'files' &&
                'bg-background text-foreground ring-1 ring-border-subtle',
            )}
            aria-label="Show files"
            aria-pressed={mode === 'files'}
            onClick={() => setMode('files')}
          >
            <IconFolder5Outline18 className="size-3.5" />
            {mode === 'files' ? <span>Files</span> : null}
          </button>
          {gitDiffAvailable ? (
            <button
              type="button"
              className={cn(
                'flex h-full items-center gap-1 rounded px-2.5 text-muted-foreground text-xs transition-colors hover:text-foreground',
                mode === 'git-diff' &&
                  'bg-background text-foreground ring-1 ring-border-subtle',
              )}
              aria-label="Show Git Diff"
              aria-pressed={mode === 'git-diff'}
              onClick={() => setMode('git-diff')}
            >
              <IconCodeBranchOutline18 className="size-3.5" />
              {mode === 'git-diff' ? <span className="pr-1">Git</span> : null}
              <span className="flex flex-col items-end justify-center font-mono text-[0.5625rem] leading-[0.55rem]">
                <span className="text-success-foreground">+52</span>
                <span className="text-error-foreground">-32</span>
              </span>
            </button>
          ) : null}
        </div>
        <Button
          className="size-7 shrink-0"
          variant="ghost"
          size="icon-sm"
          aria-label="Search files"
          onClick={() => openCommandCenter({ initialMode: 'global' })}
        >
          <SearchIcon className="size-4" />
        </Button>
      </div>
      <FileTreePreviewCoordinator
        workspaceKey={selectedWorkspaceKey}
        previewTargetPath={previewTargetPath}
        groupKey={previewGroupKey}
        onPreviewTargetClose={handlePreviewTargetClose}
      />
      <div className="min-h-0 flex-1 pt-1">
        <FileTreeWorkspaceView
          workspaceKey={selectedWorkspaceKey}
          onPreviewTargetChange={handlePreviewTargetChange}
        />
      </div>
    </aside>
  );
}
