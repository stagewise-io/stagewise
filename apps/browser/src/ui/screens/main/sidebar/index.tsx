import {
  ResizablePanel,
  type ImperativePanelHandle,
} from '@stagewise/stage-ui/components/resizable';
import { useRef, useCallback, useEffect } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  IconGear3Outline18,
  IconHotDrinkOutline18,
  IconOpenRectArrowInOutline18,
} from 'nucleo-ui-outline-18';
import { AgentsList } from './agents-list';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { useTrack } from '@ui/hooks/use-track';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useUiZoomCounterScale } from '@ui/hooks/use-ui-zoom-counter-scale';
import { TITLEBAR_HEIGHT } from '@shared/titlebar';
import { SidebarTitlebarRow } from '../_components/sidebar-titlebar-row';
import {
  readInitialSidebarCollapsed,
  useSidebarCollapsed,
} from '../_components/sidebar-collapsed-context';
import { NotificationBanners } from '../agent-chat/chat/_components/notification-banners';
import { UsageWarningBadge } from '../agent-chat/chat/_components/usage-warning-badge';
import { WorktreeCleanupBadge } from './worktree-cleanup-badge';

// Read the persisted collapsed state *once* at module eval so we can seed
// `defaultSize` on first render. Without this the panel mounts expanded
// (`defaultSize={12}`) and then collapses via effect on the next frame,
// producing a visible flash when the user last left the sidebar collapsed.
const INITIAL_COLLAPSED = readInitialSidebarCollapsed();
const DEFAULT_EXPANDED_SIZE = 6;

function getPlanLabel(plan: string | undefined): string {
  if (!plan) return 'Free';
  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
}

export function Sidebar() {
  const panelRef = useRef<ImperativePanelHandle>(null);
  const preCollapseSizeRef = useRef<number>(DEFAULT_EXPANDED_SIZE);

  const track = useTrack();
  const openSettings = useKartonProcedure((p) => p.appScreen.openSettings);
  const toggleClosedLidSleep = useKartonProcedure(
    (p) => p.closedLidSleep.toggle,
  );
  const counterScale = useUiZoomCounterScale();

  const { collapsed, setCollapsed } = useSidebarCollapsed();

  const userAccount = useKartonState((s) => s.userAccount);
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const closedLidSleep = useKartonState((s) => s.closedLidSleep);

  const isAuthenticated =
    userAccount.status === 'authenticated' ||
    userAccount.status === 'server_unreachable';
  const email = userAccount.user?.email;
  const plan = userAccount.subscription?.plan;
  const avatarChar = email ? email[0]!.toUpperCase() : null;

  const handleOpenSettings = useCallback(() => {
    track('settings-opened');
    void openSettings({ section: 'models-providers' });
  }, [openSettings, track]);

  const handleOpenAccount = useCallback(() => {
    track('account-opened');
    void openSettings({ section: 'account' });
  }, [openSettings, track]);

  const handleToggleClosedLidSleep = useCallback(() => {
    track('closed-lid-sleep-toggled', {
      enabled: !closedLidSleep.isSleepDisabled,
    });
    void toggleClosedLidSleep();
  }, [closedLidSleep.isSleepDisabled, toggleClosedLidSleep, track]);

  // Sync context-driven collapse state to the imperative panel handle.
  // Guards prevent infinite loops with onCollapse/onExpand callbacks.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const isPanelCollapsed = panel.isCollapsed();
    if (collapsed && !isPanelCollapsed) {
      const currentSize = panel.getSize();
      if (currentSize > 0) preCollapseSizeRef.current = currentSize;
      panel.collapse();
    } else if (!collapsed && isPanelCollapsed) {
      panel.expand();
      // Restore the pre-collapse size instead of defaultSize.
      // `panel.expand()` may set defaultSize; override with the
      // remembered size so user-resized widths survive collapse cycles.
      const restoreSize = preCollapseSizeRef.current;
      if (restoreSize !== DEFAULT_EXPANDED_SIZE) {
        // Delay one tick so expand() has settled.
        requestAnimationFrame(() => panel.resize(restoreSize));
      }
    }
  }, [collapsed]);

  return (
    <ResizablePanel
      ref={panelRef}
      id="new-sidebar-panel"
      order={0}
      defaultSize={INITIAL_COLLAPSED ? 0 : DEFAULT_EXPANDED_SIZE}
      minSize={6}
      maxSize={50}
      collapsible
      collapsedSize={0}
      onCollapse={() => setCollapsed(true)}
      onExpand={() => setCollapsed(false)}
      className="@container group overflow-visible! relative flex h-full min-w-44 max-w-2xl flex-col items-stretch data-[panel-size='0.0']:min-w-0"
    >
      <SidebarTitlebarRow absolute />
      {!collapsed && (
        <div
          className="flex h-full flex-col items-stretch p-2"
          style={{ paddingTop: (TITLEBAR_HEIGHT + 8) * counterScale }}
        >
          <AgentsList />

          <div className="mt-8 flex shrink-0 flex-col gap-2">
            <NotificationBanners />
            <UsageWarningBadge />
            <WorktreeCleanupBadge />
          </div>

          {/* Bottom auth section */}
          <div className="mt-2 flex shrink-0 flex-col gap-2">
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
                        disabled={closedLidSleep.isChanging}
                        onClick={handleToggleClosedLidSleep}
                      >
                        <IconHotDrinkOutline18
                          className={cn(
                            'size-4',
                            closedLidSleep.isSleepDisabled
                              ? 'text-[oklch(0.66_0.169_var(--H-yellow))] drop-shadow-[0_0_1.5px_oklch(from_var(--color-warning-solid)_l_c_h_/_0.5)] dark:text-[oklch(0.78_0.112_var(--H-yellow))]'
                              : 'text-muted-foreground',
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
                      aria-label="Settings"
                      className="app-no-drag shrink-0"
                      onClick={handleOpenSettings}
                    >
                      <IconGear3Outline18 className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Settings</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      )}
    </ResizablePanel>
  );
}
