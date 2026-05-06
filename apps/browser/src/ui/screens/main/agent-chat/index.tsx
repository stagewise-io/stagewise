import { Chat } from './chat';
import {
  ResizablePanel,
  type ImperativePanelHandle,
} from '@stagewise/stage-ui/components/resizable';
import { useRef } from 'react';
import { PendingRemovalsProvider } from '@ui/hooks/use-pending-agent-removals';
import { useKartonState } from '@ui/hooks/use-karton';

export function AgentChat() {
  const panelRef = useRef<ImperativePanelHandle>(null);
  const previousSizeRef = useRef<number | null>(null);

  const isMacOS = useKartonState((s) => s.appInfo.platform === 'darwin');

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
      className="@container group overflow-visible! z-10 flex h-full flex-col items-stretch justify-between bg-background p-1"
    >
      {/* Add a small draggable area for macOS hidden-titlebar windows */}
      {isMacOS && (
        <div className="-z-10 app-drag absolute top-0 left-0 h-8 w-full" />
      )}
      <PendingRemovalsProvider>
        <Chat />
      </PendingRemovalsProvider>
    </ResizablePanel>
  );
}
