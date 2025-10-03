import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@stagewise/stage-ui/components/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';
import {
  AlertTriangleIcon,
  ArrowRight,
  LogOutIcon,
  TerminalIcon,
  UserIcon,
} from 'lucide-react';

export function UserStatusArea() {
  const userAccount = useKartonState((s) => s.userAccount);
  const startLogin = useKartonProcedure((p) => p.userAccount.startLogin);
  const logout = useKartonProcedure((p) => p.userAccount.logout);

  // If the user isn't authenticated, we show a primary button that leads to a login session.
  // If the user is already logged in, we show a small button that simply reports the user's email.
  // Additionally, a warning should be shown, if the user's subscription is expired etc.
  // When a user is signed in but is under free access and reached the limits,
  // show a button that leads to the billing page where users can pay for the subscription
  // to get more access

  if (userAccount?.status === 'unauthenticated') {
    return (
      <Button
        variant="primary"
        size="xs"
        className="rounded-full"
        onClick={() => void startLogin()}
      >
        <span className="-ml-1.5 mr-1 rounded-full bg-white/80 px-1 text-primary">
          Free
        </span>{' '}
        Sign in <ArrowRight className="size-3" />
      </Button>
    );
  }

  if (userAccount?.status === 'authenticated') {
    // Clicking this should show a bit more information on the user's account.
    return (
      <Dialog>
        <DialogTrigger>
          <Button variant="secondary" size="xs" className="rounded-full">
            <UserIcon className="size-3" />
            {userAccount.user?.email ?? 'Unknown email'}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogClose />
          <DialogHeader>
            <DialogTitle>User Account</DialogTitle>
            <DialogDescription>
              {userAccount.user?.email ?? 'Unknown email'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-stretch gap-4">
            <div className="flex flex-col items-stretch gap-2">
              <p className="font-medium text-base">Subscription information</p>
              <div className="flex flex-row items-center justify-between gap-4">
                <p className="text-muted-foreground text-sm">Plan (ID)</p>
                <p className="text-sm">
                  {userAccount.subscription?.plan ?? 'Free'}
                </p>
              </div>
              {userAccount.subscription?.expiresAt && (
                <div className="flex flex-row items-center justify-between gap-4">
                  <p className="text-muted-foreground text-sm">Expires at</p>
                  <p className="text-sm">
                    {userAccount.subscription?.expiresAt ?? 'Never'}
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <a
              href="https://console.stagewise.io"
              target="_blank"
              className={buttonVariants({ variant: 'primary', size: 'md' })}
            >
              <TerminalIcon className="size-4" />
              Open console
            </a>
            <Button variant="secondary" onClick={() => void logout()}>
              <LogOutIcon className="size-4" />
              Logout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (userAccount?.status === 'authentication_invalid') {
    // Cicking this should show a dialog with information on this.
    // From the dialog, a re-authentication should be triggerable.
    return (
      <Popover>
        <PopoverTrigger>
          <Button variant="warning" size="xs" className="rounded-full">
            <AlertTriangleIcon className="size-3" />
            Authentication invalid
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          The currently stored authentication data is invalid. Please sign in
          again.
          <div className="flex flex-row-reverse items-center justify-start gap-2">
            <Button variant="primary" size="xs" className="rounded-full">
              Sign in again
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  if (userAccount?.status === 'server_unreachable') {
    // Clicking this should show a dialog with information on this.
    return (
      <Popover>
        <PopoverTrigger>
          <Button variant="warning" size="xs" className="rounded-full">
            <AlertTriangleIcon className="size-3" />
            Server unreachable
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          The server is currently unreachable. Please try again later.
        </PopoverContent>
      </Popover>
    );
  }

  // If the userAccount info in unavailable, we simply render nothing until it's loaded.
  return null;
}
