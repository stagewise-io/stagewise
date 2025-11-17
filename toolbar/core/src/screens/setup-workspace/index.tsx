import { Button } from '@stagewise/stage-ui/components/button';
import { ArrowLeftIcon, ArrowRightIcon, Loader2Icon } from 'lucide-react';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@stagewise/stage-ui/components/dialog';
import { ChatPanel } from '../main/sections/sidebar/chat/_components';
import { useCallback, useMemo } from 'react';
import { generateId } from '@/utils';

export const SetupWorkspaceScreen = ({ show }: { show: boolean }) => {
  const activeChatId = useKartonState(
    (s) => s.workspace?.agentChat?.activeChatId,
  );
  const chat = useKartonState((s) => s.workspace?.agentChat?.chats);

  const workspace = useKartonState((s) => s.workspace);

  const agentChatAvailable = useMemo(() => {
    const activeChatId = workspace?.agentChat?.activeChatId;
    return activeChatId !== undefined && activeChatId !== null;
  }, [workspace]);

  const hasChatMessage = useMemo(() => {
    return !!activeChatId && (chat?.[activeChatId]?.messages.length ?? 0) > 0;
  }, [activeChatId, chat]);

  const childWorkspacePaths = useKartonState(
    (s) => s.workspace?.childWorkspacePaths,
  );

  // This only happens if the current workspace has a stagewise.json file in it.
  // If this happens and the user see's the setup screen, this is because the workspace needs to be setup again.
  const currentWorkspaceInWorkspacePaths = useMemo(() => {
    return childWorkspacePaths?.find((p) => p === workspace?.path);
  }, [childWorkspacePaths, workspace]);
  const otherWorkspacePaths = useMemo(() => {
    return childWorkspacePaths?.filter((p) => p !== workspace?.path);
  }, [childWorkspacePaths, workspace]);

  const hasOtherWorkspacePaths = (otherWorkspacePaths?.length ?? 0) > 0;

  const closeWorkspace = useKartonProcedure((p) => p.workspace.close);
  const openWorkspace = useKartonProcedure((p) => p.workspace.open);

  const sendUserMessage = useKartonProcedure(
    (p) => p.agentChat.sendUserMessage,
  );

  const startSetup = useCallback(async () => {
    await sendUserMessage({
      id: generateId(),
      role: 'user',
      parts: [{ type: 'text', text: "Let's start setting up this workspace!" }],
    });
  }, [sendUserMessage]);

  const openOtherWorkspace = useCallback(
    async (path: string) => {
      await closeWorkspace().then(() => {
        void openWorkspace(path);
      });
    },
    [openWorkspace, closeWorkspace],
  );

  return (
    <>
      <Dialog open={show && !hasChatMessage} dismissible={false}>
        <DialogContent className="gap-3 delay-150 duration-300">
          <DialogHeader>
            <DialogTitle>
              {hasOtherWorkspacePaths
                ? 'Select Workspace'
                : currentWorkspaceInWorkspacePaths
                  ? 'Workspace Config Upgrade'
                  : 'Workspace Setup'}{' '}
            </DialogTitle>
            <DialogDescription>
              {hasOtherWorkspacePaths
                ? currentWorkspaceInWorkspacePaths
                  ? 'We found other workspaces within the opened path. Select one of the listed workspaces to continue or proceed with the opened workspace.'
                  : 'We found the following workspaces within the opened path:'
                : currentWorkspaceInWorkspacePaths
                  ? 'The current workspace config is incompatible with the current version of stagewise and needs to be updated.'
                  : "The current workspace is not set up yet - but don't worry:\nWe will guide you through the setup!"}
            </DialogDescription>
          </DialogHeader>
          {hasOtherWorkspacePaths && (
            <>
              <div className="glass-inset rounded-xl">
                <div className="scrollbar-thin scrollbar-thumb-foreground/20 scrollbar-track-muted-foreground/10 max-h-[30vh] min-h-36 w-full items-stretch justify-start overflow-y-auto rounded-xl p-2 *:mb-2">
                  {otherWorkspacePaths?.map((path) => (
                    <Button
                      key={path}
                      variant="secondary"
                      size="lg"
                      className="w-full justify-start"
                      onClick={() => {
                        void openOtherWorkspace(path);
                      }}
                    >
                      {path.slice(workspace?.path.length ?? 0)}
                    </Button>
                  ))}
                </div>
              </div>
              <span className="w-full text-end text-muted-foreground text-xs">
                <strong>Currently opened path:</strong> {workspace?.path}
              </span>
            </>
          )}

          <DialogFooter>
            <Button
              variant={
                hasOtherWorkspacePaths && !currentWorkspaceInWorkspacePaths
                  ? 'secondary'
                  : 'primary'
              }
              disabled={!agentChatAvailable}
              onClick={() => {
                void startSetup();
              }}
            >
              {hasOtherWorkspacePaths ? 'Set up here instead' : 'Get started'}
              {agentChatAvailable ? (
                <ArrowRightIcon className="size-4" />
              ) : (
                <Loader2Icon className="size-4 animate-spin" />
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void closeWorkspace();
              }}
            >
              {hasOtherWorkspacePaths ? 'Select other' : 'Abort'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={show && hasChatMessage} dismissible={false}>
        <DialogContent className="gap-3 delay-150 duration-300 sm:h-4/5 sm:max-h-[600px] sm:min-h-96 sm:w-4/6 sm:min-w-96 sm:max-w-xl md:p-6">
          <div className="flex flex-row items-start justify-between gap-4">
            <DialogHeader>
              <DialogTitle>
                {currentWorkspaceInWorkspacePaths
                  ? 'Workspace Config Upgrade'
                  : 'Workspace Setup'}
              </DialogTitle>
            </DialogHeader>
            <Button
              variant="secondary"
              onClick={() => {
                void closeWorkspace();
              }}
              size="md"
            >
              <ArrowLeftIcon className="size-4" />
              Abort
            </Button>
          </div>
          <ChatPanel multiChatControls={false} />
        </DialogContent>
      </Dialog>
    </>
  );
};
