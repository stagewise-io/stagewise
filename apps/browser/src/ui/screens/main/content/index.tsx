import {
  ResizablePanel,
  type ImperativePanelHandle,
} from '@stagewise/stage-ui/components/resizable';
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
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useEventListener } from '@ui/hooks/use-event-listener';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { useTrack } from '@ui/hooks/use-track';
import { BackgroundWithCutout } from './_components/background-with-cutout';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { IconVolumeUpFill18, IconVolumeXmarkFill18 } from 'nucleo-ui-fill-18';
import {
  IconPinTackOutline18,
  IconPinTackSlashOutline18,
} from 'nucleo-ui-outline-18';
import { GlobePlusIcon } from '../_components/globe-plus-icon';
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
// Pin-toggle icon overlay — replaces favicon on tab hover
// ---------------------------------------------------------------------------
function TabPinIcon({
  tab,
  openAgent,
}: {
  tab: TabState;
  openAgent: string | null;
}) {
  const setTabAgentInstance = useKartonProcedure(
    (p) => p.browser.setTabAgentInstance,
  );

  // No agent open → just show favicon, no pin toggle
  if (!openAgent) return <TabFavicon tabState={tab} />;

  const isAttachedToCurrentAgent = tab.agentInstanceId === openAgent;

  const handleToggle = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const newValue = isAttachedToCurrentAgent ? null : openAgent;
    setTabAgentInstance(tab.id, newValue);
  };

  return (
    <div className="relative size-full">
      {/* Favicon — hidden on group-hover */}
      <span className="flex size-full items-center justify-center group-hover:opacity-0">
        <TabFavicon tabState={tab} />
      </span>
      {/* Pin toggle — replaces favicon on group-hover */}
      <span
        role="button"
        tabIndex={0}
        title={isAttachedToCurrentAgent ? 'Unpin' : 'Pin to agent'}
        aria-label={
          isAttachedToCurrentAgent
            ? 'Unpin tab (make global)'
            : 'Pin tab to current agent'
        }
        className="absolute inset-0 m-0 block flex size-full items-center justify-center p-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleToggle(e);
          }
        }}
      >
        {isAttachedToCurrentAgent ? (
          <IconPinTackOutline18 className="size-3.5" />
        ) : (
          <IconPinTackSlashOutline18 className="size-3.5" />
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MainSection
// ---------------------------------------------------------------------------

const CONTENT_SIZE_KEY = 'stagewise-content-panel-size';

function readContentSize(): number {
  try {
    const stored = localStorage.getItem(CONTENT_SIZE_KEY);
    if (!stored) return 70;
    const parsed = Number.parseFloat(stored);
    return Number.isFinite(parsed) && parsed >= 20 ? parsed : 70;
  } catch {
    return 70;
  }
}

function persistContentSize(size: number) {
  try {
    localStorage.setItem(CONTENT_SIZE_KEY, String(size));
  } catch {
    // ignore
  }
}

export function MainSection() {
  const panelRef = useRef<ImperativePanelHandle>(null);
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
  const [openAgent] = useOpenAgent();
  const track = useTrack();

  // Persisted panel size survives mount/unmount (conditional rendering).
  const storedSizeRef = useRef(readContentSize());
  // Block onResize→persist during mount-time layout and programmatic restore.
  // Starts true: onResize fires BEFORE useEffect, and the panel group's
  // auto-layout size must not leak into localStorage.
  const isRestoringRef = useRef(true);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const saved = storedSizeRef.current;
    const rafId = requestAnimationFrame(() => {
      panel.resize(saved);
      const tid = setTimeout(() => {
        isRestoringRef.current = false;
      }, 150);
      // If the effect unmounts during this RAF, cancel the timeout.
      timeoutId = tid;
    });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    return () => {
      cancelAnimationFrame(rafId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Per-agent last-active-tab tracking + auto-switch on agent change
  // ---------------------------------------------------------------------------
  // Owned by the backend (persisted to tab-state.json), exposed via Karton state.
  const lastActiveTabPerAgent = useKartonState(
    (s) => s.browser.lastActiveTabPerAgent,
  );

  // When switching agents, move away from agent-exclusive tabs
  const prevOpenAgentRef = useRef<string | null>(null);
  useEffect(() => {
    const prevAgent = prevOpenAgentRef.current;
    prevOpenAgentRef.current = openAgent;

    // Only react to actual agent changes
    if (prevAgent === openAgent) return;
    if (!openAgent) return;

    // Bail only if the current tab is explicitly for this agent.
    // A global tab is "visible" everywhere but we still want to
    // switch to a remembered agent-specific tab when available.
    if (activeTabId && tabs[activeTabId]) {
      const currentTab = tabs[activeTabId];
      if (currentTab.agentInstanceId === openAgent) return;
    }

    // Need to switch — collect visible tab IDs for the new agent
    const visibleIds = Object.keys(tabs).filter((id) => {
      const t = tabs[id];
      return (
        t && (t.agentInstanceId === null || t.agentInstanceId === openAgent)
      );
    });

    // Prefer previously active tab for this agent
    const prevActive = lastActiveTabPerAgent[openAgent];
    if (prevActive && tabs[prevActive] && visibleIds.includes(prevActive)) {
      switchTab(prevActive);
      return;
    }

    // Prefer any agent-specific tab
    const agentTab = visibleIds.find(
      (id) => tabs[id]?.agentInstanceId === openAgent,
    );
    if (agentTab) {
      switchTab(agentTab);
      return;
    }

    // Prefer any global tab
    const globalTab = visibleIds.find(
      (id) => tabs[id]?.agentInstanceId === null,
    );
    if (globalTab) {
      switchTab(globalTab);
      return;
    }

    // No visible tabs for this agent — do nothing;
    // effectiveActiveTabId derived below will show empty state.
  }, [openAgent, activeTabId, tabs, switchTab]);

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

  // Sync when the server adds/removes tabs — sort global tabs first
  useEffect(() => {
    const sorted = [...serverTabIds].sort((a, b) => {
      const aGlobal = tabs[a]?.agentInstanceId === null;
      const bGlobal = tabs[b]?.agentInstanceId === null;
      if (aGlobal && !bGlobal) return -1;
      if (!aGlobal && bGlobal) return 1;
      return 0;
    });
    setOptimisticTabIds(sorted);
    // tabs omitted from deps intentionally — only re-sort on add/remove
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverTabIds]);

  // Effective active tab ID: null when the real activeTabId belongs to a
  // tab that isn't visible under the current agent (prevents showing content
  // for another agent's tab after switching agents).
  const effectiveActiveTabId = useMemo(() => {
    if (!activeTabId) return null;
    const tab = tabs[activeTabId];
    if (!tab) return null;
    if (tab.agentInstanceId === null || tab.agentInstanceId === openAgent) {
      return activeTabId;
    }
    return null;
  }, [activeTabId, tabs, openAgent]);

  // Visible tab IDs filtered to current agent (global + this agent's tabs)
  const visibleTabIds = useMemo(() => {
    return optimisticTabIds.filter((id) => {
      const tab = tabs[id];
      if (!tab) return false;
      return tab.agentInstanceId === null || tab.agentInstanceId === openAgent;
    });
  }, [optimisticTabIds, tabs, openAgent]);

  // ---------------------------------------------------------------------------
  // Detect new tabs and agentInstanceId changes — move to end of their group
  // ---------------------------------------------------------------------------
  const prevTabsRef = useRef(tabs);
  useEffect(() => {
    const prev = prevTabsRef.current;
    const idsToMove = new Set<string>();

    for (const id of Object.keys(tabs)) {
      if (!prev[id]) {
        // New tab — move to end of its group
        idsToMove.add(id);
      } else if (prev[id]?.agentInstanceId !== tabs[id]?.agentInstanceId) {
        // Pin/unpin toggled — move to end of its new group
        idsToMove.add(id);
      }
    }

    prevTabsRef.current = tabs;

    if (idsToMove.size === 0) return;

    setOptimisticTabIds((prevIds) => {
      // Preserve existing order for non-moved tabs, split by group
      const globalIds = prevIds.filter(
        (id) => tabs[id]?.agentInstanceId === null && !idsToMove.has(id),
      );
      const agentIds = prevIds.filter(
        (id) => tabs[id]?.agentInstanceId !== null && !idsToMove.has(id),
      );
      // Moved items at end of their respective groups
      const movedGlobal: string[] = [];
      const movedAgent: string[] = [];
      idsToMove.forEach((id) => {
        if (tabs[id]?.agentInstanceId === null) {
          movedGlobal.push(id);
        } else {
          movedAgent.push(id);
        }
      });
      return [...globalIds, ...movedGlobal, ...agentIds, ...movedAgent];
    });
  }, [tabs]);

  // Per-group reorder handlers — each DndContext isolated, no cross-group drag
  const handleReorderGlobal = useCallback(
    (newItems: SortableTabItem[]) => {
      const newOrder = newItems.map((t) => t.id);
      const agentIds = optimisticTabIds.filter(
        (id) => tabs[id]?.agentInstanceId !== null,
      );
      const newFullIds = [...newOrder, ...agentIds];
      setOptimisticTabIds(newFullIds);
      reorderTabs(newFullIds);
    },
    [optimisticTabIds, tabs, reorderTabs],
  );

  const handleReorderAgent = useCallback(
    (newItems: SortableTabItem[]) => {
      const newOrder = newItems.map((t) => t.id);
      const newAgentSet = new Set(newOrder);
      const globalIds = optimisticTabIds.filter(
        (id) => tabs[id]?.agentInstanceId === null,
      );
      // Preserve other agents' tabs that weren't part of this reorder.
      const otherAgentIds = optimisticTabIds.filter(
        (id) => tabs[id]?.agentInstanceId !== null && !newAgentSet.has(id),
      );
      const newFullIds = [...globalIds, ...otherAgentIds, ...newOrder];
      setOptimisticTabIds(newFullIds);
      reorderTabs(newFullIds);
    },
    [optimisticTabIds, tabs, reorderTabs],
  );

  // ---------------------------------------------------------------------------
  // Build SortableTabItem[] from optimistic order + Karton tab state
  // ---------------------------------------------------------------------------
  const tabItems = useMemo<SortableTabItem[]>(() => {
    return visibleTabIds
      .map((id): SortableTabItem | null => {
        const tab = tabs[id];
        if (!tab) return null;
        return {
          id,
          label: tab.title,
          icon: <TabPinIcon tab={tab} openAgent={openAgent} />,
          onClose: () => {
            void closeTab(id);
            removeTabUiState(id);
          },
          onAuxClick: (e: React.MouseEvent) => {
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
  }, [visibleTabIds, tabs, activeTabId, openAgent, closeTab, removeTabUiState]);

  // Split into global and agent groups for separate sortable lists
  const globalTabItems = useMemo(
    () => tabItems.filter((t) => tabs[t.id]?.agentInstanceId === null),
    [tabItems, tabs],
  );
  const agentTabItems = useMemo(
    () => tabItems.filter((t) => tabs[t.id]?.agentInstanceId !== null),
    [tabItems, tabs],
  );

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
    createTab(undefined, undefined, openAgent);
  }, [createTab, activeTabId, openAgent]);

  const handleGlobeClick = useCallback(() => {
    createTab(undefined, undefined, openAgent);
  }, [createTab, openAgent]);

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

  const tabBarScrollRef = useRef<HTMLDivElement>(null);

  const { maskStyle } = useScrollFadeMask(tabBarScrollRef, {
    axis: 'horizontal',
    fadeDistance: 8,
  });

  // Redirect vertical mouse-wheel to horizontal scroll on the tab bar.
  // Must be a non-passive listener so we can call preventDefault().
  useEffect(() => {
    const el = tabBarScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0) return; // already horizontal — leave it alone
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEventListener('focus', handleUIFocused, undefined, window);
  useEventListener(
    'stagewise-tab-focused',
    handleTabFocused,
    undefined,
    window,
  );

  return (
    <ResizablePanel
      ref={panelRef}
      id="opened-content-panel"
      order={2}
      defaultSize={storedSizeRef.current}
      minSize={20}
      onResize={(size) => {
        if (size > 0 && !isRestoringRef.current) {
          storedSizeRef.current = size;
          persistContentSize(size);
        }
      }}
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
        <div className="flex shrink-0 flex-row items-stretch gap-1 bg-background py-1.5 pl-1">
          <SortableTabs
            value={effectiveActiveTabId ?? ''}
            onValueChange={(id) => {
              if (id) void switchTab(id);
            }}
            ref={tabBarScrollRef}
            style={maskStyle}
            className="w-auto min-w-0 shrink gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {/* Global (pinned) tabs — shrinks independently, inner scroll handles overflow */}
            {globalTabItems.length > 0 && (
              <SortableTabsList
                variant="bar"
                items={globalTabItems}
                onReorder={handleReorderGlobal}
                activeValue={effectiveActiveTabId ?? ''}
                className="min-w-0 shrink"
              />
            )}
            {/* Separator */}
            {globalTabItems.length > 0 && agentTabItems.length > 0 && (
              <div className="h-full w-px shrink-0 bg-border-subtle" />
            )}
            {/* Agent-specific (unpinned) tabs — shrinks independently */}
            {agentTabItems.length > 0 && (
              <SortableTabsList
                variant="bar"
                items={agentTabItems}
                onReorder={handleReorderAgent}
                activeValue={effectiveActiveTabId ?? ''}
                className="min-w-0 shrink"
              />
            )}
          </SortableTabs>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open new browser tab"
                className="size-7 rounded-md"
                onClick={handleGlobeClick}
              >
                <GlobePlusIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open browsing tab</TooltipContent>
          </Tooltip>
        </div>
        {/* Content area with per-tab UI */}
        <div className="relative flex size-full flex-col">
          {/* Inner container with overflow clipping */}
          <div className="flex size-full flex-col overflow-hidden">
            {/* Background with mask for the web-content */}
            <BackgroundWithCutout
              className="z-0"
              targetElementId={
                effectiveActiveTabId
                  ? `dev-app-preview-container-${effectiveActiveTabId}`
                  : undefined
              }
            />
            {/* Per-tab content instances — only visible tabs */}
            {visibleTabIds.map((tabId) => (
              <PerTabContent
                key={tabId}
                ref={(ref) => {
                  tabContentRefs.current[tabId] = ref;
                }}
                tabId={tabId}
                isActive={tabId === effectiveActiveTabId}
              />
            ))}
          </div>
        </div>
      </div>
    </ResizablePanel>
  );
}
