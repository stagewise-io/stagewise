// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import {
  ResizablePanelGroup,
  ResizableHandle,
} from '@stagewise/stage-ui/components/resizable';
import { Loader2Icon } from 'lucide-react';
import { useKartonConnected } from '@/hooks/use-karton';
import { Sidebar } from './sections/sidebar';
import { MainSection } from './sections/main';

export function DefaultLayout() {
  const connected = useKartonConnected();

  if (!connected) {
    return (
      <div className="absolute inset-0 flex size-full flex-col items-center justify-center gap-4 p-4">
        <Loader2Icon className="size-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="root fixed inset-0 flex size-full flex-row items-stretch justify-between bg-zinc-50 dark:bg-zinc-950">
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
