import { ResizablePanel } from '@stagewise/stage-ui/components/resizable';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { useEventListener } from '@ui/hooks/use-event-listener';
import { useTrack } from '@ui/hooks/use-track';
import { CoreHotkeyBindings } from './_components/core-hotkey-bindings';
import {
  PerTabContent,
  type PerTabContentRef,
} from './_components/per-tab-content';
import { TabFavicon } from './_components/tab-favicon';
import { WithTabPreviewCard } from './_components/with-tab-preview-card';
import {
  SortableTabs,
  SortableTabsList,
  type SortableTabItem,
} from '@stagewise/stage-ui/components/sortable-tabs';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconVolumeUpFill18, IconVolumeXmarkFill18 } from 'nucleo-ui-fill-18';
import type { KartonContract, TabState } from '@shared/karton-contracts/ui';

// ---------------------------------------------------------------------------
// Local sub-component: audio mute toggle shown as an `actions` slot on tabs
// that are playing or muted. Rendered outside Tabs.Tab to avoid nested buttons.
// ---------------------------------------------------------------------------
function AudioMuteButton({ tab }: { tab: TabState }) {
  const toggleAudioMuted = useKartonProcedure(
    (p) => p.browser.toggleAudioMuted,
  );
  return (
    <Button
      variant="ghost"
      size="icon-2xs"
      // Prevent dnd-kit PointerSensor from activating when clicking the mute btn
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => toggleAudioMuted(tab.id)}
      className={cn(
        'shrink-0',
        tab.isMuted
          ? 'text-error hover:text-error-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
      tabIndex={-1}
    >
      {tab.isMuted ? (
        <IconVolumeXmarkFill18 className="size-3" />
      ) : (
        <IconVolumeUpFill18 className="size-3" />
      )}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// MainSection
// ---------------------------------------------------------------------------

export function MainSection() {
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const isFullScreen = useKartonState((s) => s.appInfo.isFullScreen);
  const tabs = useKartonState((s) => s.browser.tabs);
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const createTab = useKartonProcedure((p) => p.browser.createTab);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const reorderTabs = useKartonProcedure((p) => p.browser.reorderTabs);
  const togglePanelKeyboardFocus = useKartonProcedure(
    (p) => p.browser.layout.togglePanelKeyboardFocus,
  );

  const { setTabUiState, removeTabUiState } = useTabUIState();
  const track = useTrack();

  // ---------------------------------------------------------------------------
  // Optimistic tab order
  // useComparingSelector prevents a new array reference on every tab property
  // mutation (title / URL / loading state) — only the set/order of IDs matters.
  // ---------------------------------------------------------------------------
  const tabIdsSelector = useComparingSelector<KartonContract, string[]>(
    (s) => Object.keys(s.browser.tabs),
    (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  );
  const serverTabIds = useKartonState(tabIdsSelector);
  const [optimisticTabIds, setOptimisticTabIds] =
    useState<string[]>(serverTabIds);

  // Sync when the server adds/removes tabs
  useEffect(() => {
    setOptimisticTabIds(serverTabIds);
  }, [serverTabIds]);

  const handleReorder = useCallback(
    (newItems: SortableTabItem[]) => {
      const newIds = newItems.map((t) => t.id);
      setOptimisticTabIds(newIds);
      reorderTabs(newIds);
    },
    [reorderTabs],
  );

  // ---------------------------------------------------------------------------
  // Build SortableTabItem[] from optimistic order + Karton tab state
  // ---------------------------------------------------------------------------
  const tabItems = useMemo<SortableTabItem[]>(() => {
    const isOnlyTab = Object.keys(tabs).length === 1;
    return optimisticTabIds
      .map((id): SortableTabItem | null => {
        const tab = tabs[id];
        if (!tab) return null;
        const isInternalPage =
          tab.url?.startsWith('stagewise://internal/') ?? false;
        const hideClose = isOnlyTab && isInternalPage;
        return {
          id,
          label: tab.title,
          icon: <TabFavicon tabState={tab} />,
          closeable: !hideClose,
          onClose: hideClose
            ? undefined
            : () => {
                void closeTab(id);
                removeTabUiState(id);
              },
          onAuxClick: hideClose
            ? undefined
            : (e: React.MouseEvent) => {
                if (e.button !== 1) return;
                e.preventDefault();
                void closeTab(id);
                removeTabUiState(id);
              },
          actions:
            tab.isPlayingAudio || tab.isMuted ? (
              <AudioMuteButton tab={tab} />
            ) : undefined,
          wrapTrigger: (inner: ReactElement) => (
            <WithTabPreviewCard tabState={tab} activeTabId={activeTabId}>
              {inner}
            </WithTabPreviewCard>
          ),
        };
      })
      .filter((item): item is SortableTabItem => item !== null);
  }, [optimisticTabIds, tabs, activeTabId, closeTab, removeTabUiState]);

  // ---------------------------------------------------------------------------
  // Omnibox focus plumbing (unchanged)
  // ---------------------------------------------------------------------------
  const tabContentRefs = useRef<Record<string, PerTabContentRef | null>>({});
  const pendingOmniboxFocusFromTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    const pendingFromTabId = pendingOmniboxFocusFromTabIdRef.current;
    if (
      pendingFromTabId !== null &&
      activeTabId &&
      activeTabId !== pendingFromTabId
    ) {
      const tryFocus = () => {
        const ref = tabContentRefs.current[activeTabId];
        if (!ref) return false;
        void togglePanelKeyboardFocus('stagewise-ui');
        ref.focusOmnibox();
        pendingOmniboxFocusFromTabIdRef.current = null;
        return true;
      };

      if (!tryFocus()) {
        const timeoutId = setTimeout(() => {
          tryFocus();
        }, 50);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [activeTabId, tabs, togglePanelKeyboardFocus]);

  const handleCreateTab = useCallback(() => {
    pendingOmniboxFocusFromTabIdRef.current = activeTabId;
    createTab();
  }, [createTab, activeTabId]);

  const handleCleanAllTabs = useCallback(() => {
    const tabIdsToClose = Object.keys(tabs).filter(
      (tabId) => tabId !== activeTabId,
    );
    void Promise.allSettled(tabIdsToClose.map((tabId) => closeTab(tabId))).then(
      (results) => {
        const closedCount = results.filter(
          (result) => result.status === 'fulfilled',
        ).length;
        if (closedCount > 0) {
          track('tabs-cleaned', { closed_count: closedCount });
        }
      },
    );
  }, [tabs, activeTabId, closeTab, track]);

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
      if (activeTabId)
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
        {/* Tab bar */}
        <div className="flex shrink-0 flex-row items-stretch bg-background">
          <SortableTabs
            value={activeTabId ?? ''}
            onValueChange={(id) => {
              if (id) void switchTab(id);
            }}
            // Override default `w-full` so the tab list shrinks to content
            // width, leaving the trailing draggable strip room to grow into
            // the empty space.
            className="w-auto min-w-0 shrink"
          >
            <SortableTabsList
              variant="bar"
              items={tabItems}
              onReorder={handleReorder}
              activeValue={activeTabId ?? ''}
              onAddItem={handleCreateTab}
            />
          </SortableTabs>
          {/* Trailing drag strip for macOS hidden-titlebar windows — fills
              the empty row space so users can drag the window. */}
          {isMacOs && !isFullScreen && (
            <div className="app-drag h-8 grow" aria-hidden="true" />
          )}
        </div>
        {/* Content area with per-tab UI */}
        <div className="relative flex size-full flex-col">
          {/* Inner container with overflow clipping */}
          <div className="flex size-full flex-col overflow-hidden">
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
