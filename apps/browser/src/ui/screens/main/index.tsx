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
import { useCmdEnterDispatcher } from '@ui/hooks/use-cmd-enter-dispatcher';
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
import { Tutorial } from '@ui/components/tutorial';
import { GlobalHotkeyBindings } from './_components/global-hotkey-bindings';
import { AgentHotkeyBindings } from './_components/agent-hotkey-bindings';
import {
  CommandCenter,
  CommandCenterHotkeys,
  CommandCenterProvider,
} from './command-center';
import { FileTreeSidebar } from './file-tree/file-tree-sidebar';
import { FileTreeToggleButton } from './file-tree/file-tree-toggle-button';
import { SettingsSidebar } from '../settings/sidebar';
import { SettingsContent } from '../settings/content';
import {
  DEFAULT_EXPANDED_SIDEBAR_SIZE,
  SIDEBAR_PANEL_CLASS_NAME,
  SIDEBAR_PANEL_ID,
  SIDEBAR_PANEL_MAX_SIZE,
  SIDEBAR_PANEL_MIN_SIZE,
  SIDEBAR_PANEL_ORDER,
} from './_components/sidebar-panel-config';
import { LocalServersPopover } from './_components/local-servers-popover';

// Reuse the same autoSaveId as the settings screen so the root panel layout
// (sidebar width, content width) persists when switching between screens.
const rootLayoutStorageKey = 'stagewise-panel-layout-root';
const contentPanelSizeKey = 'stagewise-content-panel-size';
const fileTreePanelSizeKey = 'stagewise-file-tree-panel-size';
const CHAT_PANEL_MIN_SIZE = 20;

function readPanelSize(key: string, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = Number.parseFloat(stored);
    return Number.isFinite(parsed) && parsed >= 5 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function persistPanelSize(key: string, size: number) {
  try {
    localStorage.setItem(key, String(size));
  } catch {
    // ignore
  }
}

function ActionDivider() {
  return <div className="h-5 w-px bg-border-subtle" />;
}

export function DefaultLayout({ show }: { show: boolean }) {
  return (
    <OpenAgentProvider>
      <SidebarCollapsedProvider>
        <ContentCollapsedProvider>
          <PendingRemovalsProvider>
            <CommandCenterProvider>
              <DefaultLayoutInner show={show} />
            </CommandCenterProvider>
          </PendingRemovalsProvider>
        </ContentCollapsedProvider>
      </SidebarCollapsedProvider>
    </OpenAgentProvider>
  );
}

function DefaultLayoutInner({ show }: { show: boolean }) {
  useCmdEnterDispatcher();
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const isFullScreen = useKartonState((s) => s.appInfo.isFullScreen);
  const tabs = useKartonState((s) => s.contentTabs.tabs);
  const activeTabId = useKartonState((s) => s.contentTabs.activeTabId);
  const fileTreeVisible = useKartonState((s) => s.fileTree.visible);
  const appScreenMode = useKartonState((s) => s.appScreen.mode);
  const { setTabUiState, requestTerminalFocus } = useTabUIState();
  const [openAgent] = useOpenAgent();
  const { collapsed: sidebarCollapsed } = useSidebarCollapsed();
  const { collapsed: contentCollapsed, setCollapsed: setContentCollapsed } =
    useContentCollapsed();
  const settingsOpen = appScreenMode === 'settings';

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

  const fileTreeSizeRef = useRef(readPanelSize(fileTreePanelSizeKey, 12));
  const contentSizeRef = useRef(readPanelSize(contentPanelSizeKey, 70));

  const innerPanelLayout = useMemo(() => {
    const fileTreeSize = fileTreeVisible ? fileTreeSizeRef.current : 0;
    const desiredContentSize = showContent ? contentSizeRef.current : 0;
    const fixedPanelSize = fileTreeSize + desiredContentSize;
    const chatSize = Math.max(CHAT_PANEL_MIN_SIZE, 100 - fixedPanelSize);
    const scale =
      chatSize + fixedPanelSize > 100 ? 100 / (chatSize + fixedPanelSize) : 1;

    return {
      chatSize: chatSize * scale,
      contentSize: desiredContentSize * scale,
      fileTreeSize: fileTreeSize * scale,
    };
  }, [fileTreeVisible, showContent]);

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
    return createTerminal(undefined, openAgent).then((terminalId) => {
      if (terminalId) requestTerminalFocus(terminalId);
      return terminalId;
    });
  }, [
    createTerminal,
    openAgent,
    contentCollapsed,
    setContentCollapsed,
    requestTerminalFocus,
  ]);

  const contentPanelTopRightActions =
    showContent && !fileTreeVisible ? (
      <>
        <ContentToggleButton />
        <ActionDivider />
        <FileTreeToggleButton />
      </>
    ) : null;

  const chatTopRightActions = (
    <>
      <LocalServersPopover
        trailingContent={!showContent ? <ActionDivider /> : null}
      />
      {!showContent && (
        <>
          {hasVisibleTabs ? (
            <ContentToggleButton />
          ) : (
            <NewTabButtons
              onCreateBrowserTab={handleCreateTab}
              onCreateTerminalTab={handleOpenTerminal}
            />
          )}
          {!fileTreeVisible && (
            <>
              <ActionDivider />
              <FileTreeToggleButton />
            </>
          )}
        </>
      )}
    </>
  );

  const openedContentTopRightActions =
    showContent && fileTreeVisible ? <ContentToggleButton /> : null;

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
      {show && !settingsOpen && (
        <AgentHotkeyBindings
          onCreateTab={handleCreateTab}
          onCreateTerminalTab={handleOpenTerminal}
        />
      )}
      {show && <CommandCenterHotkeys />}
      {show && <CommandCenter />}
      {show && <Tutorial tutorialId="general-ui-experience" />}
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
          <div className="app-drag absolute top-0 left-0 -z-10 h-10 w-full" />
        )}
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId={rootLayoutStorageKey}
          className="overflow-visible! h-full w-full"
        >
          {settingsOpen ? (
            <>
              <ResizablePanel
                id={SIDEBAR_PANEL_ID}
                order={SIDEBAR_PANEL_ORDER}
                defaultSize={DEFAULT_EXPANDED_SIDEBAR_SIZE}
                minSize={SIDEBAR_PANEL_MIN_SIZE}
                maxSize={SIDEBAR_PANEL_MAX_SIZE}
                className={SIDEBAR_PANEL_CLASS_NAME}
              >
                <SettingsSidebar />
              </ResizablePanel>

              <ResizableHandle />

              <ResizablePanel
                id="content-panel"
                order={1}
                defaultSize={65}
                className={cn(
                  'relative h-full overflow-hidden rounded-l-xl bg-background ring-1 ring-derived-subtle',
                  !isMacOs && 'mt-px',
                )}
              >
                <SettingsContent />
              </ResizablePanel>
            </>
          ) : (
            <>
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
                <ResizablePanelGroup direction="horizontal" className="h-full">
                  <AgentChat
                    topRightActions={chatTopRightActions}
                    defaultSize={innerPanelLayout.chatSize}
                    minSize={CHAT_PANEL_MIN_SIZE}
                  />

                  {showContent && (
                    <>
                      <ResizableHandle className="w-0.5 bg-border" />
                      <MainSection
                        onCreateTab={handleCreateTab}
                        pendingOmniboxFocusRequest={pendingOmniboxFocusRequest}
                        onPendingOmniboxFocusHandled={
                          handlePendingOmniboxFocusHandled
                        }
                        topRightActions={
                          contentPanelTopRightActions ??
                          openedContentTopRightActions
                        }
                        defaultSize={innerPanelLayout.contentSize}
                        onPanelResize={(size) => {
                          contentSizeRef.current = size;
                          persistPanelSize(contentPanelSizeKey, size);
                        }}
                      />
                    </>
                  )}

                  {fileTreeVisible && (
                    <>
                      <ResizableHandle className="w-0.5 bg-border" />
                      <ResizablePanel
                        id="file-tree-panel"
                        order={3}
                        defaultSize={innerPanelLayout.fileTreeSize}
                        minSize={15}
                        maxSize={45}
                        onResize={(size) => {
                          if (size > 0) {
                            fileTreeSizeRef.current = size;
                            persistPanelSize(fileTreePanelSizeKey, size);
                          }
                        }}
                        className="relative min-w-[96px] overflow-hidden bg-background"
                      >
                        <div className="size-full overflow-hidden">
                          <FileTreeSidebar />
                        </div>
                      </ResizablePanel>
                    </>
                  )}
                </ResizablePanelGroup>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </>
  );
}
