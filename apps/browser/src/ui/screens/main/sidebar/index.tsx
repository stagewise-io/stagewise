import { SidebarChatSection } from './chat';
import {
  ResizablePanel,
  type ImperativePanelHandle,
} from '@stagewise/stage-ui/components/resizable';
import { SidebarTopSection } from './top';
import { ActiveAgentsGrid } from './active-agents';
import { useRef, useCallback, useState } from 'react';
import { useEventListener } from '@ui/hooks/use-event-listener';
import { ChatDraftProvider } from '@ui/hooks/use-chat-draft';
import { OpenAgentProvider } from '@ui/hooks/use-open-chat';
import { PendingRemovalsProvider } from '@ui/hooks/use-pending-agent-removals';

export function Sidebar() {
  const panelRef = useRef<ImperativePanelHandle>(null);
  const previousSizeRef = useRef<number | null>(null);

  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleCollapseChange = useCallback((isCollapsed: boolean) => {
    if (isCollapsed) {
      window.dispatchEvent(new Event('sidebar-chat-panel-closed'));
    } else {
      window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
    }
  }, []);

  useEventListener('sidebar-chat-panel-focused', () => {
    if (panelRef.current) {
      panelRef.current.expand();
      // Restore previous size if available, otherwise use defaultSize
      if (previousSizeRef.current !== null)
        panelRef.current.resize(previousSizeRef.current);
    }
  });

  useEventListener('sidebar-chat-panel-opened', () => {
    setIsCollapsed(false);
    if (panelRef.current) {
      panelRef.current.expand();
      // Restore previous size if available, otherwise use defaultSize
      if (previousSizeRef.current !== null)
        panelRef.current.resize(previousSizeRef.current);
    }
  });

  useEventListener('sidebar-chat-panel-closed', () => {
    setIsCollapsed(true);
  });

  return (
    <ResizablePanel
      ref={panelRef}
      id="sidebar-panel"
      order={1}
      defaultSize={25}
      minSize={15}
      maxSize={50}
      collapsible
      collapsedSize={0}
      onCollapse={() => {
        setIsCollapsed(true);
        handleCollapseChange(true);
      }}
      onExpand={() => {
        setIsCollapsed(false);
        handleCollapseChange(false);
        // Restore previous size when expanding
        if (panelRef.current && previousSizeRef.current !== null) {
          // Use requestAnimationFrame to ensure the panel is expanded before resizing
          requestAnimationFrame(() => {
            if (panelRef.current && previousSizeRef.current !== null)
              panelRef.current.resize(previousSizeRef.current);
          });
        }
      }}
      onResize={(size) => {
        // Track size changes to store the latest non-collapsed size
        // Only store if size is greater than 0 (not collapsed) and we're not currently collapsing
        if (size > 0 && !isCollapsed) previousSizeRef.current = size;
      }}
      data-collapsed={isCollapsed}
      className="@container group overflow-visible! flex h-full flex-col items-stretch justify-between rounded-lg bg-background p-1 ring-1 ring-derived-strong data-[collapsed=false]:min-w-64 data-[collapsed=true]:max-w-0 data-[collapsed=true]:p-0 data-[collapsed=true]:ring-transparent"
    >
      <OpenAgentProvider>
        <PendingRemovalsProvider>
          <ChatDraftProvider>
            <SidebarTopSection isCollapsed={isCollapsed} />
            <ActiveAgentsGrid />
            {/* Chat area */}
            <SidebarChatSection />
          </ChatDraftProvider>
        </PendingRemovalsProvider>
      </OpenAgentProvider>
    </ResizablePanel>
  );
}
