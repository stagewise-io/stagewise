import { SidebarChatSection } from './chat';
import {
  ResizablePanel,
  type ImperativePanelHandle,
} from '@stagewise/stage-ui/components/resizable';
import { SidebarTopSection } from './top';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useEventListener } from '@/hooks/use-event-listener';
import { usePostHog } from 'posthog-js/react';

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const panelRef = useRef<ImperativePanelHandle>(null);
  const posthog = usePostHog();

  const openChatPanel = useCallback(() => {
    panelRef.current?.expand();
    window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
  }, []);

  useEffect(() => {
    if (isCollapsed) {
      window.dispatchEvent(new Event('sidebar-chat-panel-closed'));
    } else {
      window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
    }
  }, [isCollapsed]);

  useEventListener('sidebar-chat-panel-focussed', () => {
    panelRef.current?.expand();
  });

  return (
    <ResizablePanel
      ref={panelRef}
      id="sidebar-panel"
      order={1}
      defaultSize={30}
      minSize={5}
      maxSize={80}
      collapsible
      collapsedSize={4}
      onCollapse={() => {
        setIsCollapsed(true);
        posthog?.capture('sidebar_collapsed');
      }}
      onExpand={() => {
        setIsCollapsed(false);
        posthog?.capture('sidebar_expanded');
      }}
      data-collapsed={isCollapsed}
      className="group flex h-full flex-col items-stretch justify-between border-zinc-500/20 border-r bg-muted-foreground/5 data-[collapsed=true]:w-16 data-[collapsed=false]:min-w-64 data-[collapsed=true]:min-w-16 data-[collapsed=false]:max-w-2xl data-[collapsed=true]:max-w-16"
    >
      <SidebarTopSection isCollapsed={isCollapsed} />
      <hr className="mx-4 h-px border-none bg-zinc-500/10" />

      {/* Chat area */}
      <SidebarChatSection openChatPanel={openChatPanel} />
    </ResizablePanel>
  );
}
