import { Button } from '@stagewise/stage-ui/components/button';
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import { useKartonProcedure } from '@/hooks/use-karton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@stagewise/stage-ui/components/dialog';
import { ChatPanel } from '../main/sections/sidebar/chat/_components';
import { useState, useEffect } from 'react';

export const SetupWorkspaceScreen = ({ show }: { show: boolean }) => {
  const [dismissedIntroDialog, setDismissedIntroDialog] = useState(false);

  const closeWorkspace = useKartonProcedure((p) => p.workspace.close);

  useEffect(() => {
    if (!show) {
      setDismissedIntroDialog(false);
    }
  }, [show]);

  return (
    <>
      <Dialog open={show && !dismissedIntroDialog} dismissible={false}>
        <DialogContent className="gap-3 delay-150 duration-300">
          <DialogHeader>
            <DialogTitle>Setup workspace</DialogTitle>
            <DialogDescription>
              The given workspace is not setup yet - but don't worry:
              <br />
              We will guide you through the setup in a few seconds!
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="primary"
              onClick={() => {
                setDismissedIntroDialog(true);
              }}
            >
              Get started
              <ArrowRightIcon className="size-4" />
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void closeWorkspace();
              }}
            >
              Abort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={show && dismissedIntroDialog} dismissible={false}>
        <DialogContent className="gap-3 delay-150 duration-300 sm:h-4/6 sm:max-h-[512px] sm:min-h-96 sm:w-4/6 sm:min-w-96 sm:max-w-xl md:p-6">
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
    </>
  );
};
