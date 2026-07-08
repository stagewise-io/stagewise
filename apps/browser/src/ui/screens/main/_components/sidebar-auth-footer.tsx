import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useTrack } from '@ui/hooks/use-track';
import { useCallback } from 'react';
import {
  IconGear3Outline18,
  IconHotDrinkOutline18,
  IconOpenRectArrowInOutline18,
} from '@stagewise/icons';

function getPlanLabel(plan: string | undefined): string {
  if (!plan) return 'Free';
  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
}

export function SidebarAuthFooter() {
  const track = useTrack();
  const openSettings = useKartonProcedure((p) => p.appScreen.openSettings);
  const closeSettings = useKartonProcedure((p) => p.appScreen.closeSettings);
  const toggleClosedLidSleep = useKartonProcedure(
    (p) => p.closedLidSleep.toggle,
  );

  const appScreenMode = useKartonState((s) => s.appScreen.mode);
  const userAccount = useKartonState((s) => s.userAccount);
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const closedLidSleep = useKartonState((s) => s.closedLidSleep);

  const isAuthenticated =
    userAccount.status === 'authenticated' ||
    userAccount.status === 'server_unreachable';
  const email = userAccount.user?.email;
  const plan = userAccount.subscription?.plan;
  const avatarChar = email ? email[0]!.toUpperCase() : null;
  const isSettingsOpen = appScreenMode === 'settings';

  const handleToggleSettings = useCallback(() => {
    if (isSettingsOpen) {
      void closeSettings();
      return;
    }

    track('settings-opened');
    void openSettings({ section: 'models-providers' });
  }, [closeSettings, isSettingsOpen, openSettings, track]);

  const handleOpenAccount = useCallback(() => {
    track('account-opened');
    void openSettings({ section: 'account' });
  }, [openSettings, track]);

  const handleToggleClosedLidSleep = useCallback(() => {
    if (closedLidSleep.isChanging) return;

    track('closed-lid-sleep-toggled', {
      enabled: !closedLidSleep.isSleepDisabled,
    });
    void toggleClosedLidSleep();
  }, [
    closedLidSleep.isChanging,
    closedLidSleep.isSleepDisabled,
    toggleClosedLidSleep,
    track,
  ]);

  return (
    <div className="mt-2 flex shrink-0 flex-col gap-2">
      <div className="flex flex-row items-center justify-between gap-2">
        {isAuthenticated ? (
          <button
            type="button"
            className="app-no-drag flex min-w-0 flex-1 flex-row items-center gap-2 rounded-lg px-1 py-1 hover:bg-foreground/8 active:bg-foreground/12"
            onClick={handleOpenAccount}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 font-medium text-foreground text-sm">
              {avatarChar}
            </div>
            <div className="flex w-full min-w-0 flex-col items-start gap-px overflow-hidden">
              <span className="truncate font-medium text-foreground text-sm leading-tight">
                {getPlanLabel(plan)}
              </span>
              <span className="truncate text-muted-foreground text-xs leading-tight">
                {email ?? 'Unknown'}
              </span>
            </div>
          </button>
        ) : (
          <button
            type="button"
            className="app-no-drag flex h-9 min-w-0 flex-1 flex-row items-center gap-2 rounded-lg px-1 py-1 hover:bg-foreground/8 active:bg-foreground/12"
            onClick={handleOpenAccount}
          >
            <div className="flex min-w-0 flex-row items-center gap-2">
              <IconOpenRectArrowInOutline18 className="size-5 text-foreground" />
              <span className="font-medium text-foreground text-sm leading-tight">
                Not signed in
              </span>
            </div>
          </button>
        )}

        <div className="flex shrink-0 flex-row items-center gap-1">
          {isMacOs && (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    closedLidSleep.isSleepDisabled
                      ? 'Re-enable sleep on closed lid'
                      : 'Prevent sleep on closed lid'
                  }
                  className="app-no-drag shrink-0"
                  aria-disabled={closedLidSleep.isChanging}
                  onClick={handleToggleClosedLidSleep}
                >
                  <IconHotDrinkOutline18
                    className={cn(
                      'size-4 transition-[color,filter] duration-150 ease-out',
                      closedLidSleep.isSleepDisabled
                        ? 'text-[oklch(0.66_0.169_var(--H-yellow))] drop-shadow-[0_0_1.5px_oklch(from_var(--color-warning-solid)_l_c_h_/_0.5)] group-hover/button:text-foreground group-focus-visible/button:text-foreground group-active/button:text-foreground/l-4_c-3 dark:text-[oklch(0.78_0.112_var(--H-yellow))]'
                        : 'text-muted-foreground drop-shadow-[0_0_1.5px_oklch(from_var(--color-warning-solid)_l_c_h_/_0)] group-hover/button:text-foreground group-focus-visible/button:text-foreground group-active/button:text-foreground/l-4_c-3',
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div className="flex max-w-64 flex-col gap-1">
                  <span>
                    {closedLidSleep.isSleepDisabled
                      ? 'Re-enable sleep on closed lid'
                      : 'Prevent sleep on closed lid'}
                  </span>
                  {closedLidSleep.persistenceWarning && (
                    <span className="text-muted-foreground text-xs">
                      {closedLidSleep.persistenceWarning}
                    </span>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={isSettingsOpen ? 'Close settings' : 'Settings'}
                className="app-no-drag shrink-0"
                onClick={handleToggleSettings}
                aria-pressed={isSettingsOpen}
              >
                <IconGear3Outline18
                  className={cn(
                    'size-4 transition-colors',
                    isSettingsOpen && 'text-primary-foreground',
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isSettingsOpen ? 'Close settings' : 'Settings'}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
