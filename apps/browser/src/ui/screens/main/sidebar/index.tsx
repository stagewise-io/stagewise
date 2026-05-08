import {
  ResizablePanel,
  type ImperativePanelHandle,
} from '@stagewise/stage-ui/components/resizable';
import { useRef, useCallback, useEffect } from 'react';
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
import { TITLEBAR_HEIGHT } from '@shared/titlebar';
import { SidebarTitlebarRow } from '../_components/sidebar-titlebar-row';
import {
  readInitialSidebarCollapsed,
  useSidebarCollapsed,
} from '../_components/sidebar-collapsed-context';

// Read the persisted collapsed state *once* at module eval so we can seed
// `defaultSize` on first render. Without this the panel mounts expanded
// (`defaultSize={12}`) and then collapses via effect on the next frame,
// producing a visible flash when the user last left the sidebar collapsed.
const INITIAL_COLLAPSED = readInitialSidebarCollapsed();
const DEFAULT_EXPANDED_SIZE = 12;

function getPlanLabel(plan: string | undefined): string {
  if (!plan) return 'Free';
  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
}

export function Sidebar() {
  const panelRef = useRef<ImperativePanelHandle>(null);

  const track = useTrack();
  const createTab = useKartonProcedure((p) => p.browser.createTab);

  const { collapsed, setCollapsed } = useSidebarCollapsed();

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

  // Sync context-driven collapse state to the imperative panel handle.
  // Guards prevent infinite loops with onCollapse/onExpand callbacks.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const isPanelCollapsed = panel.isCollapsed();
    if (collapsed && !isPanelCollapsed) {
      panel.collapse();
    } else if (!collapsed && isPanelCollapsed) {
      panel.expand();
    }
  }, [collapsed]);

  return (
    <ResizablePanel
      ref={panelRef}
      id="new-sidebar-panel"
      order={0}
      defaultSize={INITIAL_COLLAPSED ? 0 : DEFAULT_EXPANDED_SIZE}
      minSize={DEFAULT_EXPANDED_SIZE}
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
          style={{ paddingTop: TITLEBAR_HEIGHT + 8 }}
        >
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
        </div>
      )}
    </ResizablePanel>
  );
}
