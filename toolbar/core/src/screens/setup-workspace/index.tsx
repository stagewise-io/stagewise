import { Button } from '@stagewise/stage-ui/components/button';
import { ArrowLeftIcon } from 'lucide-react';
import { useKartonProcedure } from '@/hooks/use-karton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@stagewise/stage-ui/components/dialog';
import { ChatPanel } from '../main/sections/sidebar/chat/_components';

export const SetupWorkspaceScreen = ({ show }: { show: boolean }) => {
  const closeWorkspace = useKartonProcedure((p) => p.workspace.close);

  return (
    <Dialog open={show} dismissible={false}>
      <DialogContent className="gap-3 delay-150 duration-300 sm:h-4/6 sm:max-h-5/6 sm:min-h-96 sm:w-4/6 sm:min-w-96 sm:max-w-5/6 md:p-6">
        <div className="flex flex-row items-start justify-between gap-4">
          <DialogHeader>
            <DialogTitle>Setup workspace</DialogTitle>
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
  );
};
