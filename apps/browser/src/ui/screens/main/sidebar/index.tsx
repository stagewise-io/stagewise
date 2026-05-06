import {
  ResizablePanel,
  type ImperativePanelHandle,
} from '@stagewise/stage-ui/components/resizable';
import { useRef, useCallback } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  IconGear2Outline18,
  IconOpenRectArrowInOutline18,
} from 'nucleo-ui-outline-18';
import { AgentsList } from './agents-list';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { SETTINGS_PAGE_URL, ACCOUNT_PAGE_URL } from '@shared/internal-urls';
import { useTrack } from '@ui/hooks/use-track';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
function getPlanLabel(plan: string | undefined): string {
  if (!plan) return 'Free';
  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
}

/** Reserves space for macOS traffic-light window controls (hidden titlebar). */
function MacOsTitlebarPlaceholder() {
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const isFullScreen = useKartonState((s) => s.appInfo.isFullScreen);
  if (!isMacOs || isFullScreen) return null;
  return <div className="app-drag h-8 w-full" />;
}

export function Sidebar() {
  const panelRef = useRef<ImperativePanelHandle>(null);

  const track = useTrack();
  const createTab = useKartonProcedure((p) => p.browser.createTab);

  const userAccount = useKartonState((s) => s.userAccount);

  const isAuthenticated =
    userAccount.status === 'authenticated' ||
    userAccount.status === 'server_unreachable';
  const email = userAccount.user?.email;
  const plan = userAccount.subscription?.plan;
  const avatarChar = email ? email[0]!.toUpperCase() : null;

  const handleOpenSettings = useCallback(() => {
    track('settings-opened');
    createTab(SETTINGS_PAGE_URL, true);
  }, [createTab, track]);

  const handleOpenAccount = useCallback(() => {
    track('account-opened');
    createTab(ACCOUNT_PAGE_URL, true);
  }, [createTab, track]);

  return (
    <ResizablePanel
      ref={panelRef}
      id="new-sidebar-panel"
      order={0}
      defaultSize={12}
      minSize={12}
      maxSize={50}
      className="@container group overflow-visible! flex h-full min-w-44 max-w-2xl flex-col items-stretch p-2"
    >
      <MacOsTitlebarPlaceholder />
      <AgentsList />

      {/* Bottom auth section */}
      <div className="mt-8 flex flex-col gap-2">
        <div className="flex flex-row items-center justify-between gap-2">
          {isAuthenticated ? (
            <button
              type="button"
              className="app-no-drag flex min-w-0 flex-1 flex-row items-center gap-2 rounded-lg px-1 py-1 hover:bg-foreground/8 active:bg-foreground/12"
              onClick={handleOpenAccount}
            >
              {/* Avatar */}
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 font-medium text-foreground text-sm">
                {avatarChar}
              </div>
              {/* Plan + email */}
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

          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Settings"
                className="app-no-drag shrink-0"
                onClick={handleOpenSettings}
              >
                <IconGear2Outline18 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Settings</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </ResizablePanel>
  );
}
