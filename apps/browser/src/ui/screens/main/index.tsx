// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import {
  ResizablePanelGroup,
  ResizableHandle,
} from '@stagewise/stage-ui/components/resizable';
import { AgentChat } from './agent-chat';
import { MainSection } from './content';
import { cn } from '@ui/utils';
import { Sidebar } from './sidebar';
import { OpenAgentProvider } from '@ui/hooks/use-open-chat';
import { ChatDraftProvider } from '@ui/hooks/use-chat-draft';

const rootLayoutStorageKey = 'stagewise-panel-layout-root';
const layoutStorageKey = 'stagewise-panel-layout';

export function DefaultLayout({ show }: { show: boolean }) {
  return (
    <OpenAgentProvider>
      <ChatDraftProvider>
        <div
          className={cn(
            'root pointer-events-auto inset-0 flex size-full flex-row items-stretch justify-between transition-[opacity,filter] delay-150 duration-300 ease-out',
            !show && 'pointer-events-none opacity-0 blur-lg',
          )}
        >
          <div className="app-drag fixed top-0 right-0 left-0 h-2" />
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId={rootLayoutStorageKey}
            className="overflow-visible! h-full w-full"
          >
            <Sidebar />

            <ResizableHandle />

            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId={layoutStorageKey}
              className="h-full overflow-hidden rounded-l-lg ring-1 ring-derived-subtle"
            >
              <AgentChat />

              <ResizableHandle />

              <MainSection />
            </ResizablePanelGroup>
          </ResizablePanelGroup>
        </div>
      </ChatDraftProvider>
    </OpenAgentProvider>
  );
}
