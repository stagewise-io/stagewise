import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { cn } from '@/utils';
import { usePostHog } from 'posthog-js/react';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';
import { ExternalLinkIcon, LogOutIcon } from 'lucide-react';

export function UserStatusArea() {
  const userAccount = useKartonState((s) => s.userAccount);
  const logout = useKartonProcedure((p) => p.userAccount.logout);
  const posthog = usePostHog();

  // If the user isn't authenticated, we show a primary button that leads to a login session.
  // If the user is already logged in, we show a small button that simply reports the user's email.
  // Additionally, a warning should be shown, if the user's subscription is expired etc.
  // When a user is signed in but is under free access and reached the limits,
  // show a button that leads to the billing page where users can pay for the subscription
  // to get more access

  if (!userAccount || userAccount.status === 'unauthenticated') return null;

  return (
    <Popover>
      <PopoverTrigger>
        <Button
          size="icon-md"
          variant="secondary"
          className="shrink-0 bg-muted-foreground/20"
        >
          {userAccount.user?.email.at(0)?.toUpperCase() ?? '?'}
          <div
            className={cn(
              'absolute right-px bottom-px z-10 size-3 rounded-full bg-green-600',
              userAccount.status === 'authenticated' && 'bg-green-600',
              ['authentication_invalid', 'server_unreachable'].includes(
                userAccount.status,
              ) && 'bg-red-600',
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <PopoverTitle>User Account</PopoverTitle>
        <PopoverDescription>
          {userAccount.status === 'server_unreachable'
            ? 'Service unavailable'
            : (userAccount.user?.email ?? 'Unknown email')}
        </PopoverDescription>
        {userAccount.subscription && (
          <div className="flex flex-col items-stretch gap-4 text-foreground">
            <div className="flex flex-col items-stretch gap-2">
              <p className="font-medium text-base">Subscription information</p>
              <div className="flex flex-row items-center justify-between gap-4">
                <p className="text-muted-foreground text-sm">Plan (ID)</p>
                <p className="truncate text-sm">
                  {userAccount.subscription?.plan ?? 'Free'}
                </p>
              </div>
              {userAccount.subscription?.expiresAt && (
                <div className="flex flex-row items-center justify-between gap-4">
                  <p className="text-muted-foreground text-sm">
                    {userAccount.subscription.active
                      ? 'Expires on'
                      : 'Expired on'}
                  </p>
                  <p className="text-sm">
                    {userAccount.subscription?.expiresAt
                      ? new Date(
                          userAccount.subscription.expiresAt,
                        ).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : 'Never'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex w-full flex-row-reverse items-center justify-start gap-2">
          <a
            href="https://console.stagewise.io"
            target="_blank"
            className={buttonVariants({ variant: 'primary', size: 'sm' })}
          >
            <ExternalLinkIcon className="size-4" />
            Open console
          </a>
          <Button
            variant="secondary"
            onClick={() => {
              void logout();
              posthog?.reset();
            }}
            size="sm"
          >
            <LogOutIcon className="size-4" />
            Logout
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
