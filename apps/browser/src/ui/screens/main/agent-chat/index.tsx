import { Chat } from './chat';
import {
  ResizablePanel,
  type ImperativePanelHandle,
} from '@stagewise/stage-ui/components/resizable';
import { useRef } from 'react';
import { TITLEBAR_HEIGHT } from '@shared/titlebar';
import { useKartonState } from '@ui/hooks/use-karton';
import { useSidebarCollapsed } from '../_components/sidebar-collapsed-context';
import { SidebarTitlebarRow } from '../_components/sidebar-titlebar-row';

export function AgentChat() {
  const panelRef = useRef<ImperativePanelHandle>(null);
  const previousSizeRef = useRef<number | null>(null);

  const isMacOS = useKartonState((s) => s.appInfo.platform === 'darwin');
  const { collapsed } = useSidebarCollapsed();

  return (
    <ResizablePanel
      ref={panelRef}
      id="sidebar-panel"
      order={1}
      defaultSize={35}
      minSize={20}
      maxSize={80}
      onResize={(size) => {
        // Track size changes to store the latest non-collapsed size
        // Only store if size is greater than 0 (not collapsed) and we're not currently collapsing
        if (size > 0) previousSizeRef.current = size;
      }}
      className="@container group overflow-visible! relative z-10 flex h-full flex-col items-stretch justify-between bg-background"
    >
      {/* Add a small draggable area for macOS hidden-titlebar windows */}
      {isMacOS && (
        <div
          className="-z-10 app-drag absolute top-0 left-0 w-full"
          style={{ height: TITLEBAR_HEIGHT }}
        />
      )}
      {collapsed && <SidebarTitlebarRow absolute />}
      <div className="flex h-full flex-col items-stretch justify-between p-1">
        <Chat />
      </div>
    </ResizablePanel>
  );
}
