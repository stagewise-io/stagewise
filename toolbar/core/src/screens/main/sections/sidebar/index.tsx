import { SidebarChatSection } from './chat';
import { ResizablePanel } from '@stagewise/stage-ui/components/resizable';
import { SidebarTopSection } from './top';
import { SidebarSubsystemStatusSection } from './subsystem-status';

export function Sidebar() {
  return (
    <ResizablePanel
      id="sidebar-panel"
      order={1}
      defaultSize={30}
      minSize={25}
      maxSize={50}
      className="flex h-full flex-col items-stretch justify-between border-zinc-500/20 border-r bg-muted-foreground/5"
    >
      <SidebarTopSection />

      <hr className="mx-4 h-px border-none bg-zinc-500/10" />

      {/* Subsystem status area */}
      <SidebarSubsystemStatusSection />

      <hr className="h-px border-none bg-zinc-500/20" />

      {/* Chat area */}
      <SidebarChatSection />
    </ResizablePanel>
  );
}
