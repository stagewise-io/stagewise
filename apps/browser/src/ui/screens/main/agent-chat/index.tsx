import { Chat } from './chat';
import {
  ResizablePanel,
  type ImperativePanelHandle,
} from '@stagewise/stage-ui/components/resizable';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useSidebarCollapsed } from '../_components/sidebar-collapsed-context';
import { SidebarTitlebarRow } from '../_components/sidebar-titlebar-row';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useEmptyAgentId } from '@ui/hooks/use-empty-agent';
import { usePendingRemovals } from '@ui/hooks/use-pending-agent-removals';
import { useTrack } from '@ui/hooks/use-track';
import { EMPTY_MOUNTS } from '@shared/karton-contracts/ui';

type AgentChatProps = {
  topRightActions?: ReactNode;
  defaultSize?: number;
  minSize?: number;
};

export function AgentChat({
  topRightActions,
  defaultSize = 35,
  minSize = 20,
}: AgentChatProps) {
  const panelRef = useRef<ImperativePanelHandle>(null);
  const previousSizeRef = useRef<number | null>(null);
  const { collapsed } = useSidebarCollapsed();
  const [openAgent, setOpenAgent] = useOpenAgent();
  const createAgent = useKartonProcedure((p) => p.agents.create);
  const setLastOpenAgentId = useKartonProcedure(
    (p) => p.browser.setLastOpenAgentId,
  );
  const track = useTrack();

  const agentTitle = useKartonState((s) =>
    openAgent ? s.agents.instances[openAgent]?.state.title : undefined,
  );

  const openAgentModelId = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.activeModelId ?? null)
      : null,
  );
  const openAgentToolApprovalMode = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.toolApprovalMode ?? null)
      : null,
  );
  const currentMounts = useKartonState((s) =>
    openAgent
      ? (s.toolbox[openAgent]?.workspace?.mounts ?? EMPTY_MOUNTS)
      : EMPTY_MOUNTS,
  );

  // Ref snapshots so the callback isn't re-created on every state change.
  const openAgentModelIdRef = useRef(openAgentModelId);
  openAgentModelIdRef.current = openAgentModelId;
  const openAgentToolApprovalModeRef = useRef(openAgentToolApprovalMode);
  openAgentToolApprovalModeRef.current = openAgentToolApprovalMode;
  const currentMountPathsRef = useRef(currentMounts.map((m) => m.path));
  currentMountPathsRef.current = currentMounts.map((m) => m.path);

  const [, emptyAgentIdRef] = useEmptyAgentId();

  const { pending: pendingRemovals } = usePendingRemovals();
  const pendingRemovalsRef = useRef(pendingRemovals);
  pendingRemovalsRef.current = pendingRemovals;

  // Pending guard: prevents duplicate blank chats on rapid clicks.
  const [pendingCreate, setPendingCreate] = useState(false);

  const handleCreateChat = useCallback(() => {
    if (pendingCreate) return;
    void track('chat-new-agent-clicked', {
      source: 'collapsed-titlebar',
    });

    // Reuse an existing empty agent instead of creating a new one.
    const existingEmpty = emptyAgentIdRef.current;
    if (existingEmpty && !pendingRemovalsRef.current.has(existingEmpty)) {
      setOpenAgent(existingEmpty);
      void setLastOpenAgentId(existingEmpty);
      return;
    }

    setPendingCreate(true);
    const currentModelId = openAgentModelIdRef.current ?? undefined;
    const currentToolApprovalMode =
      openAgentToolApprovalModeRef.current ?? undefined;
    const paths = currentMountPathsRef.current;
    void createAgent(
      undefined,
      currentModelId,
      currentToolApprovalMode,
      paths.length > 0 ? paths : undefined,
    )
      .then((id) => {
        setOpenAgent(id);
        setPendingCreate(false);
        void setLastOpenAgentId(id);
      })
      .catch((err) => {
        console.error('Failed to create agent:', err);
        setPendingCreate(false);
      });
  }, [pendingCreate, createAgent, emptyAgentIdRef, setOpenAgent, track]);

  return (
    <ResizablePanel
      ref={panelRef}
      id="sidebar-panel"
      order={1}
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={80}
      onResize={(size) => {
        if (size > 0) previousSizeRef.current = size;
      }}
      className="@container group overflow-visible! relative z-10 flex h-full flex-col items-stretch justify-between bg-background"
    >
      {topRightActions && (
        <div
          data-tutorial="new-tab-buttons"
          className="app-no-drag absolute top-1 right-2 z-20 flex items-center gap-0 rounded-xl"
        >
          {topRightActions}
        </div>
      )}
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
