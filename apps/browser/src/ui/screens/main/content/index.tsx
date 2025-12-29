import { ResizablePanel } from '@stagewise/stage-ui/components/resizable';
import { useTabUIState } from '@/hooks/use-tab-ui-state';
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import { useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '@stagewise/stage-ui/lib/utils';
import {
  TabsContainer,
  DND_DROP_ANIMATION_DURATION,
} from './_components/tabs-container';
import { useEventListener } from '@/hooks/use-event-listener';
import { BackgroundWithCutout } from './_components/background-with-cutout';
import { CoreHotkeyBindings } from './_components/core-hotkey-bindings';
import {
  PerTabContent,
  type PerTabContentRef,
} from './_components/per-tab-content';

export function MainSection({
  isSidebarCollapsed,
  openSidebarChatPanel,
}: {
  isSidebarCollapsed: boolean;
  openSidebarChatPanel: () => void;
}) {
  const tabs = useKartonState((s) => s.browser.tabs);
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const createTab = useKartonProcedure((p) => p.browser.createTab);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);

  const { setTabUiState } = useTabUIState();

  // Track interpolated border radius during tab drag (for smooth corner transition)
  const [dragBorderRadius, setDragBorderRadius] = useState<number | null>(null);
  // Track if the active tab is being dragged to position 0
  const [isActiveTabDragAtPositionZero, setIsActiveTabDragAtPositionZero] =
    useState(false);

  // Store refs for each tab's PerTabContent
  const tabContentRefs = useRef<Record<string, PerTabContentRef | null>>({});

  const handleDragBorderRadiusChange = useCallback((radius: number | null) => {
    setDragBorderRadius(radius);
  }, []);

  const handleActiveTabDragAtPositionZero = useCallback(
    (isAtPositionZero: boolean) => {
      if (isAtPositionZero)
        setTimeout(() => {
          setIsActiveTabDragAtPositionZero(true);
        }, DND_DROP_ANIMATION_DURATION - 50);
      else setIsActiveTabDragAtPositionZero(false);
    },
    [],
  );

  const handleCreateTab = useCallback(() => {
    createTab();
    // Focus URL bar of the new active tab after a short delay to allow it to mount
    setTimeout(() => {
      const newActiveTabId = Object.keys(tabs)[Object.keys(tabs).length - 1];
      if (newActiveTabId) {
        tabContentRefs.current[newActiveTabId]?.focusOmnibox();
      }
    }, 50);
  }, [createTab, tabs]);

  const handleCleanAllTabs = useCallback(() => {
    Object.values(tabs).forEach((tab) => {
      if (tab.id !== activeTabId) {
        closeTab(tab.id);
      }
    });
  }, [tabs, activeTabId, closeTab]);

  const handleFocusUrlBar = useCallback(() => {
    if (activeTabId) {
      tabContentRefs.current[activeTabId]?.focusOmnibox();
    }
  }, [activeTabId]);

  const handleFocusSearchBar = useCallback(() => {
    if (activeTabId) {
      tabContentRefs.current[activeTabId]?.focusSearchBar();
    }
  }, [activeTabId]);

  const activeTabIndex = useMemo(() => {
    return Object.keys(tabs).findIndex((_id) => _id === activeTabId) ?? 0;
  }, [activeTabId, tabs]);

  const handleTabFocused = useCallback(
    (event: CustomEvent<string>) => {
      setTabUiState(event.detail, {
        focusedPanel: 'tab-content',
      });
    },
    [setTabUiState],
  );

  const handleUIFocused = useCallback(
    (_e: FocusEvent) => {
      setTabUiState(activeTabId, {
        focusedPanel: 'stagewise-ui',
      });
    },
    [activeTabId, setTabUiState],
  );

  useEventListener('focus', handleUIFocused, undefined, window);

  useEventListener(
    'stagewise-tab-focused',
    handleTabFocused,
    undefined,
    window,
  );

  const showTopLeftCornerRadius = useMemo(() => {
    return activeTabIndex !== 0 || isSidebarCollapsed;
  }, [activeTabIndex, isSidebarCollapsed]);

  return (
    <ResizablePanel
      id="opened-content-panel"
      order={2}
      defaultSize={70}
      className="@container overflow-visible! flex h-full flex-1 flex-col items-start justify-between"
    >
      <CoreHotkeyBindings
        onCreateTab={handleCreateTab}
        onFocusUrlBar={handleFocusUrlBar}
        onFocusSearchBar={handleFocusSearchBar}
        onCleanAllTabs={handleCleanAllTabs}
      />
      <div className="flex h-full w-full flex-col">
        <TabsContainer
          openSidebarChatPanel={openSidebarChatPanel}
          isSidebarCollapsed={isSidebarCollapsed}
          onAddTab={handleCreateTab}
          onCleanAllTabs={handleCleanAllTabs}
          onDragBorderRadiusChange={handleDragBorderRadiusChange}
          onActiveTabDragAtPositionZero={handleActiveTabDragAtPositionZero}
        />
        {/* Content area with per-tab UI */}
        <div
          className={cn(
            'relative flex size-full flex-col rounded-b-lg rounded-tr-lg',
            // Only apply the static rounded-tl-lg class when not during a drag with interpolated radius
            dragBorderRadius === null && showTopLeftCornerRadius
              ? 'rounded-tl-lg'
              : '',
          )}
          style={
            dragBorderRadius !== null
              ? { borderTopLeftRadius: `${dragBorderRadius}px` }
              : undefined
          }
        >
          {/* Background layer that can extend beyond rounded corners
              Only show when actively dragging the active tab to position 0 */}
          {dragBorderRadius !== null && isActiveTabDragAtPositionZero && (
            <div className="-z-30 absolute inset-0 rounded-lg rounded-tl-none bg-background/40" />
          )}
          {/* Inner container with overflow clipping */}
          <div className="flex size-full flex-col overflow-hidden rounded-[inherit]">
            {/* Background with mask for the web-content */}
            <BackgroundWithCutout
              className={cn(`z-0`)}
              borderRadius={4}
              targetElementId={
                activeTabId
                  ? `dev-app-preview-container-${activeTabId}`
                  : undefined
              }
            />

            {/* Per-tab content instances */}
            {Object.keys(tabs).map((tabId) => (
              <PerTabContent
                key={tabId}
                ref={(ref) => {
                  tabContentRefs.current[tabId] = ref;
                }}
                tabId={tabId}
                isActive={tabId === activeTabId}
              />
            ))}
          </div>
        </div>
      </div>
    </ResizablePanel>
  );
}
