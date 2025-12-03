import { Button } from '@stagewise/stage-ui/components/button';

import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
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

  const createFilePickerRequest = useKartonProcedure(
    (p) => p.filePicker.createRequest,
  );

  const selectAndOpenWorkspace = useCallback(async () => {
    if (workspace) await closeWorkspace();
    await openWorkspace(undefined);
  }, [createFilePickerRequest, openWorkspace, workspace, closeWorkspace]);

  const reloadWorkspace = useCallback(() => {
    const workspacePath = workspace!.path;
    void closeWorkspace().then(() => {
      void openWorkspace(workspacePath);
    });
  }, [closeWorkspace, openWorkspace, workspace]);

  if (!workspace) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="ml-4 text-foreground text-sm"
        onClick={selectAndOpenWorkspace}
      >
        {status === 'loading' ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <PlusIcon className="size-4" />
        )}
        {status === 'loading' ? 'Select a workspace...' : 'Connect a workspace'}{' '}
        <br />
      </Button>
    );
  }

  if (status === 'setup') {
    return (
      <div className="flex flex-row items-center gap-2 px-4 text-sm">
        <span className="shimmer-text shimmer-duration-2500 shimmer-from-muted-foreground shimmer-to-zinc-50">
          Set up workspace in chat...
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-foreground/70 text-sm"
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
          className="ml-4"
          size={isCollapsed ? 'icon-md' : 'md'}
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
          <p className="select-text break-all text-foreground/70 text-sm">
            {workspace?.path}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={reloadWorkspace}
              >
                Reload
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload workspace</TooltipContent>
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
