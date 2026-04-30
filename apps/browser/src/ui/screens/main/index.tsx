// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import {
  ResizablePanelGroup,
  ResizableHandle,
} from '@stagewise/stage-ui/components/resizable';
import { Sidebar } from './sidebar';
import { MainSection } from './content';
import { cn } from '@ui/utils';
import { useCallback, useRef, useState } from 'react';
import { useEventListener } from '@ui/hooks/use-event-listener';
import { useTrack } from '@ui/hooks/use-track';

const layoutStorageKey = 'stagewise-panel-layout';

export function DefaultLayout({ show }: { show: boolean }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const track = useTrack();
  // Mirror the collapsed state so the listeners can detect real transitions
  // without depending on React's async state.
  const collapsedRef = useRef(false);
  const hasInitializedRef = useRef(false);

  const applyCollapsed = useCallback(
    (next: boolean) => {
      const isInitial = !hasInitializedRef.current;
      hasInitializedRef.current = true;
      if (collapsedRef.current === next) return;
      collapsedRef.current = next;
      setIsSidebarCollapsed(next);
      if (isInitial) return;
      track('chat-sidebar-toggled', {
        new_value: next ? 'closed' : 'open',
      });
    },
    [track],
  );

  useEventListener('sidebar-chat-panel-closed', () => {
    applyCollapsed(true);
  });
  useEventListener('sidebar-chat-panel-opened', () => {
    applyCollapsed(false);
  });

  const openSidebarChatPanel = useCallback(() => {
    window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
  }, []);

  const layoutChangeHandler = useCallback(
    (layout: number[]) => {
      applyCollapsed(layout[0] === 0);
    },
    [applyCollapsed],
  );

  return (
    <div
      className={cn(
        'root pointer-events-auto inset-0 flex size-full flex-row items-stretch justify-between gap-2 p-1.5 transition-[opacity,filter] delay-150 duration-300 ease-out',
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
