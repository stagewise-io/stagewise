import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@ui/utils';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { SearchIcon, XIcon } from 'lucide-react';
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

  const previewGroupKey = `file-tree-preview:${openAgent ?? 'global'}`;

  return (
    <aside className="flex h-full w-full flex-col bg-background">
      <div
        className={cn(
          'flex shrink-0 flex-row items-stretch gap-1 bg-background p-1.5 pr-1',
          workspaces.length > 0 && 'border-derived-strong border-b',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-row items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
      {workspaces.length > 0 && (
        <div className="flex h-9 shrink-0 items-center justify-end border-derived-strong border-b bg-background px-1.5">
          {/* Files/Git mode switcher hidden until Git Diff view is functional. */}
          <Button
            className="size-7 shrink-0"
            variant="ghost"
            size="icon-sm"
            aria-label="Search files"
            onClick={() =>
              openCommandCenter({
                initialMode: 'files',
                initialFileWorkspaceKeys: selectedWorkspaceKey
                  ? [selectedWorkspaceKey]
                  : undefined,
              })
            }
          >
            <SearchIcon className="size-4" />
          </Button>
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
