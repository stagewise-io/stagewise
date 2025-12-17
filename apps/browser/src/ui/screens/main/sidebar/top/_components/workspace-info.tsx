import { Button } from '@stagewise/stage-ui/components/button';
import TimeAgo from 'react-timeago';
import {
  Menu,
  MenuItem,
  MenuTrigger,
  MenuContent,
  MenuSeparator,
} from '@stagewise/stage-ui/components/menu';

import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import { cn } from '@/utils';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@stagewise/stage-ui/components/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useCallback, useMemo } from 'react';
import {
  ChevronDownIcon,
  FolderIcon,
  Loader2Icon,
  PlusIcon,
} from 'lucide-react';

export function WorkspaceInfoBadge({ isCollapsed }: { isCollapsed: boolean }) {
  const workspace = useKartonState((s) => s.workspace);
  const platform = useKartonState((s) => s.appInfo.platform);
  const isFullScreen = useKartonState((s) => s.appInfo.isFullScreen);

  const workspaceDir = useMemo(() => {
    return workspace
      ? workspace.path
          .replace('\\', '/')
          .split('/')
          .filter((p) => p !== '')
          .pop()
      : null;
  }, [workspace]);

  const openWorkspace = useKartonProcedure((p) => p.workspace.open);
  const closeWorkspace = useKartonProcedure((p) => p.workspace.close);

  const status = useKartonState((s) => s.workspaceStatus);
  const recentlyOpenedWorkspaces = useKartonState(
    (s) => s.userExperience.recentlyOpenedWorkspaces,
  );

  const topRecentlyOpenedWorkspaces = useMemo(() => {
    return [...recentlyOpenedWorkspaces]
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, 3);
  }, [recentlyOpenedWorkspaces]);

  const createFilePickerRequest = useKartonProcedure(
    (p) => p.filePicker.createRequest,
  );

  const selectAndOpenWorkspace = useCallback(async () => {
    if (workspace) await closeWorkspace();
    await openWorkspace(undefined);
  }, [createFilePickerRequest, openWorkspace, workspace, closeWorkspace]);

  const disconnectWorkspace = useCallback(async () => {
    void closeWorkspace();
  }, [closeWorkspace]);

  if (isCollapsed) return null;

  if (!workspace && topRecentlyOpenedWorkspaces.length === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'text-foreground text-sm',
          !isCollapsed && platform === 'darwin' && !isFullScreen
            ? 'ml-4'
            : 'ml-0',
        )}
        onClick={selectAndOpenWorkspace}
      >
        {status === 'loading' ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <PlusIcon className="size-4 shrink-0" />
        )}
        {status === 'loading' ? 'Select a workspace...' : 'Connect a workspace'}{' '}
        <br />
      </Button>
    );
  }

  if (!workspace && topRecentlyOpenedWorkspaces.length > 0) {
    return (
      <Menu>
        <MenuTrigger>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'truncate text-foreground text-sm',
              !isCollapsed && platform === 'darwin' && !isFullScreen
                ? 'ml-4'
                : 'ml-0',
            )}
          >
            {status === 'loading' ? (
              <Loader2Icon className="size-4 shrink-0 animate-spin" />
            ) : (
              <PlusIcon className="size-4 shrink-0" />
            )}
            <span className="truncate">Connect a workspace</span>
          </Button>
        </MenuTrigger>
        <MenuContent>
          <span className="px-2 py-1 font-normal text-muted-foreground text-xs">
            Recent workspaces
          </span>
          {topRecentlyOpenedWorkspaces.map((workspace) => (
            <MenuItem
              key={workspace.path}
              onClick={async () => {
                void openWorkspace(workspace.path);
              }}
            >
              <div className="flex max-w-48 flex-col gap-0">
                <div className="flex flex-row items-center justify-between gap-2">
                  <span className="font-medium text-sm">{workspace.name}</span>
                  <span className="font-normal text-muted-foreground/60 text-xs">
                    <TimeAgo date={workspace.openedAt} />
                  </span>
                </div>
                <span
                  className="min-w-0 truncate font-normal text-muted-foreground text-xs"
                  dir="rtl"
                >
                  <span dir="ltr">{workspace.path}</span>
                </span>
              </div>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onClick={selectAndOpenWorkspace}>
            <PlusIcon className="size-4 shrink-0" />
            <span className="font-normal text-sm">Connect new workspace</span>
          </MenuItem>
        </MenuContent>
      </Menu>
    );
  }

  if (status === 'setup') {
    return (
      <div className="flex flex-row items-center gap-2 px-4 pl-8 text-xs">
        <span className="shimmer-text shimmer-duration-2500 shimmer-from-muted-foreground shimmer-to-zinc-50 truncate">
          Workspace setup...
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-foreground/70 text-xs"
          onClick={() => {
            void closeWorkspace();
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger>
        <Button
          className={cn(
            !isCollapsed && platform === 'darwin' && !isFullScreen
              ? 'ml-4'
              : 'ml-0',
          )}
          size={isCollapsed ? 'icon-sm' : 'sm'}
          variant="ghost"
        >
          {isCollapsed ? (
            <FolderIcon className="size-5" />
          ) : (
            <>
              <span className="min-w-0 truncate">
                {workspaceDir ?? 'No workspace loaded'}
              </span>
              <ChevronDownIcon className="size-4 shrink-0" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverTitle>Workspace Info</PopoverTitle>

        <div className="flex flex-col gap-0">
          <h3 className="font-medium text-sm">Path</h3>
          <p
            className="min-w-0 select-text truncate text-foreground/70 text-sm"
            dir="rtl"
          >
            <span dir="ltr">{workspace?.path}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={disconnectWorkspace}
              >
                Disconnect
              </Button>
            </TooltipTrigger>
            <TooltipContent>Disconnect workspace</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={selectAndOpenWorkspace}
              >
                Switch
              </Button>
            </TooltipTrigger>
            <TooltipContent>Switch workspace</TooltipContent>
          </Tooltip>
        </div>
      </PopoverContent>
    </Popover>
  );
}
