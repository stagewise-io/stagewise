import { Chat } from './chat';
import {
  ResizablePanel,
  type ImperativePanelHandle,
} from '@stagewise/stage-ui/components/resizable';
import { useCallback, useRef } from 'react';
import { useSidebarCollapsed } from '../_components/sidebar-collapsed-context';
import { SidebarTitlebarRow } from '../_components/sidebar-titlebar-row';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';

export function AgentChat() {
  const panelRef = useRef<ImperativePanelHandle>(null);
  const previousSizeRef = useRef<number | null>(null);
  const { collapsed } = useSidebarCollapsed();
  const [openAgent, setOpenAgent] = useOpenAgent();
  const createAgent = useKartonProcedure((p) => p.agents.create);
  const agentTitle = useKartonState((s) =>
    openAgent ? s.agents.instances[openAgent]?.state.title : undefined,
  );

  const handleCreateChat = useCallback(() => {
    void createAgent().then((id) => {
      if (id) setOpenAgent(id);
    });
  }, [createAgent, setOpenAgent]);

  return (
    <ResizablePanel
      ref={panelRef}
      id="sidebar-panel"
      order={1}
      defaultSize={35}
      minSize={20}
      maxSize={80}
      onResize={(size) => {
        if (size > 0) previousSizeRef.current = size;
      }}
      className="@container group overflow-visible! relative z-10 flex h-full flex-col items-stretch justify-between bg-background"
    >
      {collapsed && (
        <SidebarTitlebarRow
          absolute
          sidebarCollapsed
          agentTitle={agentTitle}
          onCreateChat={handleCreateChat}
        />
      )}
      <div className="flex h-full flex-col items-stretch justify-between p-1">
        <Chat />
      </div>
    </ResizablePanel>
  );
}
