import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
} from '@stagewise/stage-ui/components/dialog';
import { Loader2Icon } from 'lucide-react';

/**
 * Conditionally rendering dialog for authentication setup.
 * Is only rendered if the user is not authenticated.
 */
export const AuthDialog = () => {
  const loginDialogData = useKartonState((s) => s.userAccount?.loginDialog);
  const abortLogin = useKartonProcedure((p) => p.userAccount.abortLogin);

  return (
    <Dialog open={!!loginDialogData} dismissible={false}>
      <DialogContent className="h-[80vh] max-h-[80vh] min-h-[80vh] w-[80vw] min-w-[80vw] max-w-[80vw]">
        <DialogClose
          onClick={() => {
            void abortLogin();
          }}
        />
        <DialogTitle>Authenticate with stagewise</DialogTitle>
        <div className="mt-5 flex flex-1 items-center justify-center">
          <Loader2Icon className="size-10 animate-spin text-blue-600" />
          <iframe
            title="Stagewise auth portal"
            src={loginDialogData?.startUrl}
            className="glass-inset absolute inset-0 size-full rounded-xl"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
