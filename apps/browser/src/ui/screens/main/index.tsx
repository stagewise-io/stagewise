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
import { useCallback, useMemo } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { GlobePlusIcon } from './_components/globe-plus-icon';
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
import { ContentToggleButton } from './_components/content-toggle-button';
import { AgentHotkeyBindings } from './_components/agent-hotkey-bindings';

const rootLayoutStorageKey = 'stagewise-panel-layout-root';

export function DefaultLayout({ show }: { show: boolean }) {
  return (
    <OpenAgentProvider>
      <ChatDraftProvider>
        <SidebarCollapsedProvider>
          <ContentCollapsedProvider>
            <PendingRemovalsProvider>
              <DefaultLayoutInner show={show} />
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
  const tabs = useKartonState((s) => s.browser.tabs);
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
  // content panel visible when there are visible tabs AND it's not collapsed
  const showContent = hasVisibleTabs && !contentCollapsed;

  const handleOpenTab = useCallback(() => {
    if (contentCollapsed) setContentCollapsed(false);
    createTab(undefined, undefined, openAgent);
  }, [createTab, openAgent, contentCollapsed, setContentCollapsed]);

  // Headless: keeps `openAgent` valid regardless of whether the sidebar
  // (which used to own this effect) is mounted.
  useAutoSelectFirstAgent();

  return (
    <>
      {show && <AgentHotkeyBindings />}
      <div
        className={cn(
          'root pointer-events-auto relative inset-0 flex size-full flex-row items-stretch justify-between transition-[opacity,filter] delay-150 duration-300 ease-out',
          !show && 'pointer-events-none opacity-0 blur-lg',
        )}
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
              'relative h-full overflow-hidden rounded-l-xl ring-1 ring-derived-subtle',
              !isMacOs && 'mt-px',
            )}
          >
            {/* Top-right action button: content toggle when tabs visible, globe when none */}
            <div className="app-no-drag absolute top-1 right-1 z-20">
              {hasVisibleTabs ? (
                <ContentToggleButton />
              ) : (
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Open new browser tab"
                      onClick={handleOpenTab}
                    >
                      <GlobePlusIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open browsing tab</TooltipContent>
                </Tooltip>
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
                  <MainSection />
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );
}
