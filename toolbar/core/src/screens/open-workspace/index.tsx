import { AnimatedGradientBackground } from '@/components/ui/animated-gradient-background';
import { Button } from '@stagewise/stage-ui/components/button';
import { Logo } from '@/components/ui/logo';
import { ArrowRightIcon } from 'lucide-react';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { UserStatusArea } from '../main/sections/sidebar/top/_components/user-status';
import { useCallback } from 'react';

export const OpenWorkspaceScreen = () => {
  const startedInPath = useKartonState((s) => s.appInfo.startedInPath);

  const openWorkspace = useKartonProcedure((p) => p.workspace.open);

  const createFilePickerRequest = useKartonProcedure(
    (p) => p.filePicker.createRequest,
  );

  const selectFolderAndOpenWorkspace = useCallback(() => {
    void createFilePickerRequest({
      title: 'Select a workspace',
      description: 'Select a workspace to open',
      type: 'directory',
    }).then((selection) => {
      if (selection.length === 0) return;
      void openWorkspace(selection[0]!);
    });
  }, [createFilePickerRequest]);

  const openWorkspaceInCurrentDirectory = useCallback(() => {
    void openWorkspace(startedInPath);
  }, [openWorkspace, startedInPath]);

  return (
    <div className="absolute inset-0 flex h-scren w-screen flex-col items-center justify-center bg-background">
      <div className="flex max-w-xl flex-col items-start gap-3 p-4">
        <div className="flex w-full flex-row items-end justify-between gap-4">
          <div className="glass-body -ml-0.5 flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full">
            <AnimatedGradientBackground className="absolute inset-0 z-0 size-full" />
            <Logo
              color="white"
              className="z-10 mr-px mb-px size-1/2 shadow-2xs"
            />
          </div>
          <UserStatusArea />
        </div>
        <h1 className="text-start font-medium text-3xl">Open workspace</h1>
        <p className="mb-8 text-start text-muted-foreground">
          Workspaces are the root folders of your app under development.
        </p>

        <div className="flex w-full flex-row-reverse gap-2">
          <Button
            variant="primary"
            className="shrink-0"
            onClick={selectFolderAndOpenWorkspace}
          >
            Select workspace
            <ArrowRightIcon className="size-4" />
          </Button>

          <Button
            variant="secondary"
            className="shrink-0"
            onClick={openWorkspaceInCurrentDirectory}
          >
            Create in current directory
            <ArrowRightIcon className="size-4" />
          </Button>
        </div>
        <span className="w-full text-end text-muted-foreground text-xs">
          <strong>Current directory:</strong> {startedInPath}
        </span>
      </div>
    </div>
  );
};
