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
import { ChevronDownIcon } from 'lucide-react';

export function WorkspaceInfoBadge() {
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

  const disconnectWorkspace = useCallback(async () => {
    void closeWorkspace();
  }, [closeWorkspace]);

  if (!workspace) return null;
  if (status === 'setup') return null;

  return (
    <Popover>
      <PopoverTrigger>
        <Button size="sm" variant="ghost">
          <span className="min-w-0 truncate text-sm">
            {workspaceDir ?? 'No workspace loaded'}
          </span>
          <ChevronDownIcon className="size-4 shrink-0" />
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
                <span className="shrink-0">Change workspace</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Switch workspace</TooltipContent>
          </Tooltip>
        </div>
      </PopoverContent>
    </Popover>
  );
}
