// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import {
  ResizablePanelGroup,
  ResizableHandle,
  ResizablePanel,
} from '@stagewise/stage-ui/components/resizable';
import { AgentChat } from './agent-chat';
import { MainSection } from './content';
import { cn } from '@ui/utils';
import { Sidebar } from './sidebar';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { OpenAgentProvider, useOpenAgent } from '@ui/hooks/use-open-chat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NewTabButtons } from './_components/new-tab-buttons';
import { ChatDraftProvider } from '@ui/hooks/use-chat-draft';
import { PendingRemovalsProvider } from '@ui/hooks/use-pending-agent-removals';
import { useAutoSelectFirstAgent } from '@ui/hooks/use-auto-select-agent';
import {
  SidebarCollapsedProvider,
  useSidebarCollapsed,
} from './_components/sidebar-collapsed-context';
import {
  ContentCollapsedProvider,
  useContentCollapsed,
} from './_components/content-collapsed-context';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import { ContentToggleButton } from './_components/content-toggle-button';
import { GlobalHotkeyBindings } from './_components/global-hotkey-bindings';
import { AgentHotkeyBindings } from './_components/agent-hotkey-bindings';
import {
  CommandCenter,
  CommandCenterHotkeys,
  CommandCenterProvider,
} from './command-center';

// Reuse the same autoSaveId as the settings screen so the root panel layout
// (sidebar width, content width) persists when switching between screens.
const rootLayoutStorageKey = 'stagewise-panel-layout-root';

export function DefaultLayout({ show }: { show: boolean }) {
  return (
    <OpenAgentProvider>
      <ChatDraftProvider>
        <SidebarCollapsedProvider>
          <ContentCollapsedProvider>
            <PendingRemovalsProvider>
              <CommandCenterProvider>
                <DefaultLayoutInner show={show} />
              </CommandCenterProvider>
            </PendingRemovalsProvider>
          </ContentCollapsedProvider>
        </SidebarCollapsedProvider>
      </ChatDraftProvider>
    </OpenAgentProvider>
  );
}

function DefaultLayoutInner({ show }: { show: boolean }) {
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const isFullScreen = useKartonState((s) => s.appInfo.isFullScreen);
  const tabs = useKartonState((s) => s.contentTabs.tabs);
  const activeTabId = useKartonState((s) => s.contentTabs.activeTabId);
  const { setTabUiState } = useTabUIState();
  const [openAgent] = useOpenAgent();
  const { collapsed: sidebarCollapsed } = useSidebarCollapsed();
  const { collapsed: contentCollapsed, setCollapsed: setContentCollapsed } =
    useContentCollapsed();

  const hasVisibleTabs = useMemo(() => {
    return Object.values(tabs).some(
      (tab) =>
        tab.agentInstanceId === null || tab.agentInstanceId === openAgent,
    );
  }, [tabs, openAgent]);

  const createTab = useKartonProcedure((p) => p.browser.createTab);
  const createTerminal = useKartonProcedure((p) => p.browser.createTerminal);
  // content panel visible when there are visible tabs AND it's not collapsed
  const showContent = hasVisibleTabs && !contentCollapsed;

  const pendingOmniboxFocusRequestIdRef = useRef(0);
  const pendingOmniboxFocusExpiryRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pendingOmniboxFocusRequestRef = useRef<{
    id: number;
    fromTabId: string | null;
    targetTabId: string;
  } | null>(null);
  const [pendingOmniboxFocusRequest, setPendingOmniboxFocusRequest] = useState<{
    id: number;
    fromTabId: string | null;
    targetTabId: string;
  } | null>(null);

  useEffect(() => {
    pendingOmniboxFocusRequestRef.current = pendingOmniboxFocusRequest;
  }, [pendingOmniboxFocusRequest]);

  useEffect(() => {
    return () => {
      if (pendingOmniboxFocusExpiryRef.current !== null)
        clearTimeout(pendingOmniboxFocusExpiryRef.current);
    };
  }, []);

  const handleCreateTab = useCallback(() => {
    if (contentCollapsed) setContentCollapsed(false);

    const requestId = ++pendingOmniboxFocusRequestIdRef.current;
    if (pendingOmniboxFocusExpiryRef.current !== null) {
      clearTimeout(pendingOmniboxFocusExpiryRef.current);
      pendingOmniboxFocusExpiryRef.current = null;
    }
    setPendingOmniboxFocusRequest(null);

    void createTab(undefined, undefined, openAgent).then((targetTabId) => {
      if (requestId !== pendingOmniboxFocusRequestIdRef.current) return;
      if (!targetTabId) return;

      setPendingOmniboxFocusRequest({
        id: requestId,
        fromTabId: activeTabId ?? null,
        targetTabId,
      });

      pendingOmniboxFocusExpiryRef.current = setTimeout(() => {
        setPendingOmniboxFocusRequest((request) =>
          request?.id === requestId ? null : request,
        );
        pendingOmniboxFocusExpiryRef.current = null;
      }, 5000);
    });
  }, [
    activeTabId,
    createTab,
    openAgent,
    contentCollapsed,
    setContentCollapsed,
  ]);

  const handlePendingOmniboxFocusHandled = useCallback((requestId: number) => {
    if (pendingOmniboxFocusRequestRef.current?.id !== requestId) return;

    if (pendingOmniboxFocusExpiryRef.current !== null) {
      clearTimeout(pendingOmniboxFocusExpiryRef.current);
      pendingOmniboxFocusExpiryRef.current = null;
    }

    pendingOmniboxFocusRequestRef.current = null;
    setPendingOmniboxFocusRequest(null);
  }, []);

  const handleOpenTerminal = useCallback(() => {
    if (contentCollapsed) setContentCollapsed(false);
    return createTerminal(undefined, openAgent);
  }, [createTerminal, openAgent, contentCollapsed, setContentCollapsed]);

  const markStagewiseUiFocused = useCallback(() => {
    if (!activeTabId) return;
    setTabUiState(activeTabId, { focusedPanel: 'stagewise-ui' });
  }, [activeTabId, setTabUiState]);

  // Headless: keeps `openAgent` valid regardless of whether the sidebar
  // (which used to own this effect) is mounted.
  useAutoSelectFirstAgent();

  return (
    <>
      {show && <GlobalHotkeyBindings />}
      {show && (
        <AgentHotkeyBindings
          onCreateTab={handleCreateTab}
          onCreateTerminalTab={handleOpenTerminal}
        />
      )}
      {show && <CommandCenterHotkeys />}
      {show && <CommandCenter />}
      <div
        className={cn(
          'root pointer-events-auto relative inset-0 flex size-full flex-row items-stretch justify-between transition-[opacity,filter] delay-150 duration-300 ease-out',
          !show && 'pointer-events-none opacity-0 blur-lg',
        )}
        onFocusCapture={markStagewiseUiFocused}
        onPointerDownCapture={markStagewiseUiFocused}
      >
        {/* Single global drag zone for macOS titlebar — sits behind everything */}
        {isMacOs && !isFullScreen && (
          <div className="app-drag absolute top-0 left-0 -z-10 h-8 w-full" />
        )}
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId={rootLayoutStorageKey}
          className="overflow-visible! h-full w-full"
        >
          <Sidebar />

          {!sidebarCollapsed && <ResizableHandle />}

          <ResizablePanel
            id="content-panel"
            order={1}
            defaultSize={65}
            className={cn(
              'relative h-full overflow-hidden ring-1 ring-derived-subtle',
              !sidebarCollapsed && 'rounded-l-xl',
              !isMacOs && 'mt-px',
            )}
          >
            {/* Top-right action button: content toggle when tabs visible, globe when none */}
            <div className="app-no-drag absolute top-1 right-2 z-20">
              {hasVisibleTabs ? (
                <ContentToggleButton />
              ) : (
                <NewTabButtons
                  onCreateBrowserTab={handleCreateTab}
                  onCreateTerminalTab={handleOpenTerminal}
                />
              )}
            </div>
            <ResizablePanelGroup
              direction="horizontal"
              className="h-full divide-x divide-surface-1"
            >
              <AgentChat />

              {showContent && (
                <>
                  <ResizableHandle />
                  <MainSection
                    onCreateTab={handleCreateTab}
                    pendingOmniboxFocusRequest={pendingOmniboxFocusRequest}
                    onPendingOmniboxFocusHandled={
                      handlePendingOmniboxFocusHandled
                    }
                  />
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );
}
