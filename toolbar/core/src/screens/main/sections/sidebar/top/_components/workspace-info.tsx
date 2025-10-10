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

  const createFilePickerRequest = useKartonProcedure(
    (p) => p.filePicker.createRequest,
  );

  const selectAndOpenWorkspace = useCallback(() => {
    void createFilePickerRequest({
      title: 'Select a workspace',
      description: 'Select a workspace to load',
      type: 'directory',
      multiple: false,
    })
      .then(async (path) => {
        if (workspace) {
          await closeWorkspace();
        }
        await openWorkspace(path[0]!);
      })
      .catch((error) => {
        console.error('Error selecting workspace:', error);
      });
  }, [createFilePickerRequest, openWorkspace, workspace, closeWorkspace]);

  const reloadWorkspace = useCallback(() => {
    const workspacePath = workspace!.path;
    void closeWorkspace().then(() => {
      void openWorkspace(workspacePath);
    });
  }, [closeWorkspace, openWorkspace, workspace]);

  if (!workspace) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger>
        <Button size="md" variant="ghost">
          {workspaceDir ?? 'No workspace loaded'}
          <ChevronDownIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverTitle>Workspace Info</PopoverTitle>

        <div className="flex flex-col gap-0">
          <h3 className="font-medium text-sm">Path</h3>
          <p className="text-foreground/70 text-sm">{workspace?.path}</p>
        </div>

        <div className="flex flex-col gap-0">
          <h3 className="font-medium text-sm">Dev App Port</h3>
          <p className="font-mono text-foreground/70 text-sm">
            {workspace?.config?.appPort ?? 'unknown'}
          </p>
        </div>

        <div className="flex flex-col gap-0">
          <h3 className="font-medium text-sm">
            Loaded Plugins{' '}
            <span className="inline-body glass-body rounded-full bg-black/60 px-1 py-px text-white text-xs">
              {workspace?.plugins?.length ?? 0}
            </span>
          </h3>
          <p className="text-foreground/70 text-sm">
            {workspace?.plugins?.map((plugin) => plugin.name).join(', ')}
            {workspace?.plugins?.length === 0 && 'No plugins loaded'}
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
