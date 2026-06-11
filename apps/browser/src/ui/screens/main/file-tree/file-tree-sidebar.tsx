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
import { XIcon } from 'lucide-react';
import {
  IconFileSearchOutline18,
  IconFolderSearchOutline18,
} from 'nucleo-ui-outline-18';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HotkeyActions } from '@shared/hotkeys';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import { useCommandCenter } from '../command-center';
import { FileTreePreviewCoordinator } from './file-tree-preview-coordinator';
import { FileTreeWorkspaceView } from './file-tree-workspace-view';
import {
  getFileTreeWorkspaceKey,
  getFileTreeWorkspaceMountsForAgent,
  getFileTreeWorkspaceName,
} from './file-tree-utils';
import { Tutorial } from '@ui/components/tutorial';

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
          className="flex h-9 shrink-0 items-center justify-end gap-0.5 border-derived-strong border-b bg-background pr-1.5 pl-2"
        >
          {/* Files/Git mode switcher hidden until Git Diff view is functional. */}
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
      )}
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
