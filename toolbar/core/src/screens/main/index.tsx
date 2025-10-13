// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import {
  ResizablePanelGroup,
  ResizableHandle,
} from '@stagewise/stage-ui/components/resizable';
import { Sidebar } from './sections/sidebar';
import { MainSection } from './sections/main';
import { cn } from '@/utils';

export function DefaultLayout({ show }: { show: boolean }) {
  return (
    <div
      className={cn(
        'root fixed inset-0 flex size-full flex-row items-stretch justify-between transition-all delay-150 duration-300 ease-out',
        !show && 'pointer-events-none translate-y-8 opacity-0 blur-lg',
      )}
    >
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="stagewise-center-panel-layout"
        className="h-full"
      >
        <Sidebar />

        <ResizableHandle />

        <MainSection />
      </ResizablePanelGroup>
    </div>
  );
}
