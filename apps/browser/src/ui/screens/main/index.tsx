// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import {
  ResizablePanelGroup,
  ResizableHandle,
} from '@stagewise/stage-ui/components/resizable';
import { Sidebar } from './sidebar';
import { MainSection } from './content';
import { cn } from '@/utils';
import { useCallback, useState } from 'react';
import { useEventListener } from '@/hooks/use-event-listener';

const layoutStorageKey = 'stagewise-panel-layout';

export function DefaultLayout({ show }: { show: boolean }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  useEventListener('sidebar-chat-panel-closed', () => {
    setIsSidebarCollapsed(true);
  });
  useEventListener('sidebar-chat-panel-opened', () => {
    setIsSidebarCollapsed(false);
  });

  const openSidebarChatPanel = useCallback(() => {
    window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
  }, []);

  const layoutChangeHandler = useCallback((layout: number[]) => {
    if (layout[0] === 0) {
      setIsSidebarCollapsed(true);
    } else {
      setIsSidebarCollapsed(false);
    }
  }, []);

  return (
    <div
      className={cn(
        'root pointer-events-auto inset-0 flex size-full flex-row items-stretch justify-between gap-2 p-2 transition-all delay-150 duration-300 ease-out',
        !show && 'pointer-events-none opacity-0 blur-lg',
      )}
    >
      <div className="app-drag fixed top-0 right-0 left-0 h-2" />
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId={layoutStorageKey}
        className="overflow-visible! h-full"
        onLayout={layoutChangeHandler}
      >
        <Sidebar />

        <ResizableHandle
          className={cn('w-1', isSidebarCollapsed ? 'hidden' : '')}
        />

        <MainSection
          isSidebarCollapsed={isSidebarCollapsed}
          openSidebarChatPanel={openSidebarChatPanel}
        />
      </ResizablePanelGroup>
    </div>
  );
}
