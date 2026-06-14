import {
  ResizablePanel,
  type ImperativePanelHandle,
} from '@stagewise/stage-ui/components/resizable';
import { useRef, useEffect } from 'react';
import { AgentsList } from './agents-list';
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
import { SidebarAuthFooter } from '../_components/sidebar-auth-footer';
import {
  DEFAULT_EXPANDED_SIDEBAR_SIZE,
  SIDEBAR_PANEL_CLASS_NAME,
  SIDEBAR_PANEL_ID,
  SIDEBAR_PANEL_MAX_SIZE,
  SIDEBAR_PANEL_MIN_SIZE,
  SIDEBAR_PANEL_ORDER,
} from '../_components/sidebar-panel-config';

// Read the persisted collapsed state *once* at module eval so we can seed
// `defaultSize` on first render. Without this the panel mounts expanded
// (`defaultSize={12}`) and then collapses via effect on the next frame,
// producing a visible flash when the user last left the sidebar collapsed.
const INITIAL_COLLAPSED = readInitialSidebarCollapsed();
export function Sidebar() {
  const panelRef = useRef<ImperativePanelHandle>(null);
  const preCollapseSizeRef = useRef<number>(DEFAULT_EXPANDED_SIDEBAR_SIZE);

  const counterScale = useUiZoomCounterScale();

  const { collapsed, setCollapsed } = useSidebarCollapsed();

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
      if (restoreSize !== DEFAULT_EXPANDED_SIDEBAR_SIZE) {
        // Delay one tick so expand() has settled.
        requestAnimationFrame(() => panel.resize(restoreSize));
      }
    }
  }, [collapsed]);

  return (
    <ResizablePanel
      ref={panelRef}
      id={SIDEBAR_PANEL_ID}
      order={SIDEBAR_PANEL_ORDER}
      defaultSize={INITIAL_COLLAPSED ? 0 : DEFAULT_EXPANDED_SIDEBAR_SIZE}
      minSize={SIDEBAR_PANEL_MIN_SIZE}
      maxSize={SIDEBAR_PANEL_MAX_SIZE}
      collapsible
      collapsedSize={0}
      onCollapse={() => setCollapsed(true)}
      onExpand={() => setCollapsed(false)}
      data-tutorial="sidebar-panel"
      className={`${SIDEBAR_PANEL_CLASS_NAME} data-[panel-size='0.0']:min-w-0`}
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

          <SidebarAuthFooter />
        </div>
      )}
    </ResizablePanel>
  );
}
