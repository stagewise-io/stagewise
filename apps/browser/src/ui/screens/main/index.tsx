// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import {
  ResizablePanelGroup,
  ResizableHandle,
} from '@stagewise/stage-ui/components/resizable';
import { Sidebar } from './sidebar';
import { MainSection } from './content';
import { cn } from '@/utils';

export function DefaultLayout({ show }: { show: boolean }) {
  return (
    <div
      className={cn(
        'root inset-0 flex size-full flex-row items-stretch justify-between gap-2 p-2 transition-all delay-150 duration-300 ease-out',
        !show && 'pointer-events-none opacity-0 blur-lg',
      )}
    >
      <div className="app-drag fixed top-0 right-0 left-0 h-2" />
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="stagewise-center-panel-layout"
        className="overflow-visible! h-full"
      >
        <Sidebar />

        <ResizableHandle className="w-0.5" />

        <MainSection />
      </ResizablePanelGroup>
    </div>
  );
}
