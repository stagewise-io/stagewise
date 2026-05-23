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

import { BrowserTabHotkeys } from './_components/browser-tab-hotkeys';
import {
  PerTabContent,
  type PerTabContentRef,
} from './_components/per-tab-content';
import { TabFavicon } from './_components/tab-favicon';
import { WithTabPreviewCard } from './_components/with-tab-preview-card';
import { WithTerminalTabPreviewCard } from './_components/with-terminal-tab-preview-card';
import {
  SortableTabs,
  SortableTabsList,
  type SortableTabItem,
} from '@stagewise/stage-ui/components/sortable-tabs';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
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
import { NewTabButtons } from '../_components/new-tab-buttons';
import type { KartonContract, TabState } from '@shared/karton-contracts/ui';
import { HotkeyActions } from '@shared/hotkeys';

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

  // No agent open → show icon only, no pin toggle
  if (!openAgent) {
    return <TabFavicon tabState={tab} />;
  }

  const isAttachedToCurrentAgent = tab.agentInstanceId === openAgent;

  const handleToggle = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const newValue = isAttachedToCurrentAgent ? null : openAgent;
    setTabAgentInstance(tab.id, newValue);
  };

  return (
    <div className="relative size-full">
      {/* Icon — hidden on group-hover */}
      <span className="flex size-full items-center justify-center group-hover:opacity-0">
        <TabFavicon tabState={tab} />
      </span>
      {/* Pin toggle — replaces icon on group-hover.
          Rendered as <div> instead of <Button> because it sits inside
          TabsBase.Tab which already renders a <button>. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              role="button"
              tabIndex={0}
              aria-label={isAttachedToCurrentAgent ? 'Pin globally' : 'Unpin'}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-2xs' }),
                'absolute inset-0 size-full text-subtle-foreground opacity-0 group-hover:opacity-100',
              )}
              onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
              onClick={handleToggle}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggle(e);
                }
              }}
            >
              {isAttachedToCurrentAgent ? (
                <IconPinTackOutline18 className="size-3.5" />
              ) : (
                <IconPinTackSlashOutline18 className="size-3.5" />
              )}
            </div>
          }
        />
        <TooltipContent side="bottom">
          {isAttachedToCurrentAgent ? 'Pin globally' : 'Unpin'}
        </TooltipContent>
      </Tooltip>
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

export function MainSection({
  onCreateTab,
  pendingOmniboxFocusRequest,
  onPendingOmniboxFocusHandled,
}: {
  onCreateTab: () => void;
  pendingOmniboxFocusRequest: {
    id: number;
    fromTabId: string | null;
    targetTabId: string;
  } | null;
  onPendingOmniboxFocusHandled: (requestId: number) => void;
}) {
  const panelRef = useRef<ImperativePanelHandle>(null);
  const tabs = useKartonState((s) => s.contentTabs.tabs);
  const globalOrder = useKartonState((s) => s.contentTabs.globalOrder);
  const agentOrders = useKartonState((s) => s.contentTabs.agentOrders);
  const activeTabId = useKartonState((s) => s.contentTabs.activeTabId);
  const createTerminal = useKartonProcedure((p) => p.browser.createTerminal);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const reorderTabs = useKartonProcedure((p) => p.browser.reorderTabs);
  const togglePanelKeyboardFocus = useKartonProcedure(
    (p) => p.browser.layout.togglePanelKeyboardFocus,
  );

  const { setTabUiState, removeTabUiState } = useTabUIState();
  const [openAgent] = useOpenAgent();

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

  // When switching agents, move away from agent-exclusive tabs.
  // Ref-based reads prevent stale closures so the effect always sees
  // current Karton state even when lazily-created tabs land between
  // the agent switch and the next render.
  const prevOpenAgentRef = useRef<string | null>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const globalOrderRef = useRef(globalOrder);
  globalOrderRef.current = globalOrder;
  const agentOrdersRef = useRef(agentOrders);
  agentOrdersRef.current = agentOrders;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const lastActiveTabPerAgentRef = useRef(lastActiveTabPerAgent);
  lastActiveTabPerAgentRef.current = lastActiveTabPerAgent;

  useEffect(() => {
    const prevAgent = prevOpenAgentRef.current;
    prevOpenAgentRef.current = openAgent;

    // Only react to actual agent changes
    if (prevAgent === openAgent) return;
    if (!openAgent) return;

    const curTabs = tabsRef.current;
    const curActiveId = activeTabIdRef.current;
    const curLastActive = lastActiveTabPerAgentRef.current;
    const curGlobalOrder = globalOrderRef.current;
    const curAgentOrders = agentOrdersRef.current;

    // Bail only if the current tab is explicitly for this agent.
    // A global tab is "visible" everywhere but we still want to
    // switch to a remembered agent-specific tab when available.
    if (curActiveId && curTabs[curActiveId]) {
      const currentTab = curTabs[curActiveId];
      if (currentTab.agentInstanceId === openAgent) return;
    }

    // Need to switch — collect visible tab IDs for the new agent
    const visibleIds = [
      ...curGlobalOrder.filter((id) => curTabs[id]?.agentInstanceId === null),
      ...(openAgent ? (curAgentOrders[openAgent] ?? []) : []).filter(
        (id) => curTabs[id]?.agentInstanceId === openAgent,
      ),
    ];

    // Prefer previously active tab for this agent
    const prevActive = curLastActive[openAgent];
    if (prevActive && curTabs[prevActive] && visibleIds.includes(prevActive)) {
      switchTab(prevActive);
      return;
    }

    // Prefer any agent-specific tab
    const agentTab = visibleIds.find(
      (id) => curTabs[id]?.agentInstanceId === openAgent,
    );
    if (agentTab) {
      switchTab(agentTab);
      return;
    }

    // Prefer any global tab
    const globalTab = visibleIds.find(
      (id) => curTabs[id]?.agentInstanceId === null,
    );
    if (globalTab) {
      switchTab(globalTab);
      return;
    }

    // No visible tabs for this agent — do nothing;
    // effectiveActiveTabId derived below will show empty state.
  }, [openAgent, switchTab, globalOrder, agentOrders]);

  // ---------------------------------------------------------------------------
  // Optimistic tab order
  // useComparingSelector prevents a new array reference on every tab property
  // mutation (title / URL / loading state) — only the set/order of IDs matters.
  // ---------------------------------------------------------------------------

  const tabIdsSelector = useComparingSelector<KartonContract, string[]>(
    (s) => [
      ...s.contentTabs.globalOrder,
      ...Object.keys(s.contentTabs.agentOrders)
        .sort()
        .flatMap((agentId) => s.contentTabs.agentOrders[agentId] ?? []),
    ],
    (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  );
  const serverTabIds = useKartonState(tabIdsSelector);
  const [optimisticTabIds, setOptimisticTabIds] =
    useState<string[]>(serverTabIds);

  // Sync when the server adds/removes/reorders tabs. The backend owns
  // canonical tab order via explicit global/per-agent order arrays.
  useEffect(() => {
    setOptimisticTabIds(serverTabIds);
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

  const replaceReorderedSlots = useCallback(
    (newItems: SortableTabItem[], shouldReplace: (id: string) => boolean) => {
      const replacementIds = newItems.map((t) => t.id);
      const replacementSet = new Set(replacementIds);
      let replacementIndex = 0;

      const nextIds = optimisticTabIds.map((id) => {
        if (!shouldReplace(id)) return id;
        return replacementIds[replacementIndex++] ?? id;
      });

      // If the rendered group did not occupy the same number of slots as the
      // reordered result, fall back to preserving untouched ids and appending
      // any missing reordered ids. This should not happen during normal DnD,
      // but avoids silently dropping tabs on stale state.
      const missingReplacementIds = replacementIds.filter(
        (id) => !nextIds.includes(id),
      );
      const dedupedIds = nextIds.filter(
        (id, index) => !replacementSet.has(id) || nextIds.indexOf(id) === index,
      );
      const newFullIds = [...dedupedIds, ...missingReplacementIds];

      setOptimisticTabIds(newFullIds);
      reorderTabs(newFullIds);
    },
    [optimisticTabIds, reorderTabs],
  );

  // Per-group reorder handlers — each DndContext isolated, no cross-group drag.
  // Only replace the dragged group's existing slots. The backend writes the
  // result into explicit global/per-agent order arrays.
  const handleReorderGlobal = useCallback(
    (newItems: SortableTabItem[]) => {
      replaceReorderedSlots(
        newItems,
        (id) => tabs[id]?.agentInstanceId === null,
      );
    },
    [replaceReorderedSlots, tabs],
  );

  const handleReorderAgent = useCallback(
    (newItems: SortableTabItem[]) => {
      const reorderedIds = new Set(newItems.map((t) => t.id));
      const agentId = newItems.find((t) => tabs[t.id])
        ? tabs[newItems.find((t) => tabs[t.id])!.id]?.agentInstanceId
        : openAgent;

      replaceReorderedSlots(
        newItems,
        (id) => reorderedIds.has(id) || tabs[id]?.agentInstanceId === agentId,
      );
    },
    [openAgent, replaceReorderedSlots, tabs],
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
          closeShortcut: (
            <HotkeyCombo action={HotkeyActions.CLOSE_TAB} size="xs" />
          ),
          onAuxClick: (e: React.MouseEvent) => {
            if (e.button !== 1) return;
            e.preventDefault();
            void closeTab(id);
            removeTabUiState(id);
          },
          actions:
            tab.type !== 'terminal' && (tab.isPlayingAudio || tab.isMuted) ? (
              <AudioMuteButton tab={tab} />
            ) : undefined,
          wrapTrigger: (inner: ReactElement) =>
            tab.type === 'terminal' ? (
              <WithTerminalTabPreviewCard
                tabState={tab}
                activeTabId={activeTabId}
              >
                {inner}
              </WithTerminalTabPreviewCard>
            ) : (
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

  const handleFocusUrlBar = useCallback(() => {
    if (effectiveActiveTabId) {
      tabContentRefs.current[effectiveActiveTabId]?.focusOmnibox();
    }
  }, [effectiveActiveTabId]);

  const handleFocusSearchBar = useCallback(() => {
    if (effectiveActiveTabId) {
      tabContentRefs.current[effectiveActiveTabId]?.focusSearchBar();
    }
  }, [effectiveActiveTabId]);

  useEffect(() => {
    if (!pendingOmniboxFocusRequest || !activeTabId) return;

    const { id: requestId, targetTabId } = pendingOmniboxFocusRequest;
    if (activeTabId !== targetTabId) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tryFocus = async () => {
      if (cancelled) return true;

      const ref = tabContentRefs.current[activeTabId];
      if (!ref) return false;

      // Ensure the UI view owns keyboard focus before the omnibox focuses its
      // DOM input. If the chat input was focused, focusing the omnibox first can
      // race with the async panel-focus handoff and let TipTap reclaim focus.
      try {
        await togglePanelKeyboardFocus('stagewise-ui');
      } catch {
        // Still focus the omnibox if the panel-focus handoff fails.
      }
      if (cancelled) return true;
      if (activeTabIdRef.current !== targetTabId) return false;
      if (tabContentRefs.current[targetTabId] !== ref) return false;

      ref.focusOmnibox();
      onPendingOmniboxFocusHandled(requestId);
      return true;
    };

    const scheduleRetry = () => {
      timeoutId = setTimeout(() => {
        void tryFocus().then((focused) => {
          if (focused || cancelled) return;
          scheduleRetry();
        });
      }, 50);
    };

    void tryFocus().then((focused) => {
      if (focused || cancelled) return;
      scheduleRetry();
    });

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [
    activeTabId,
    pendingOmniboxFocusRequest,
    togglePanelKeyboardFocus,
    onPendingOmniboxFocusHandled,
  ]);

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
      <BrowserTabHotkeys
        onFocusUrlBar={handleFocusUrlBar}
        onFocusSearchBar={handleFocusSearchBar}
      />
      <div className="flex h-full w-full flex-col">
        {/* Tab bar */}
        <div className="flex shrink-0 flex-row items-stretch gap-1 border-derived-strong border-b bg-background py-1.5 pr-10 pl-1">
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
          <NewTabButtons
            buttonClassName="size-7"
            onCreateBrowserTab={onCreateTab}
            onCreateTerminalTab={() =>
              void createTerminal(undefined, openAgent)
            }
          />
        </div>
        {/* Content area with per-tab UI */}
        <div className="relative flex size-full flex-col">
          {/* Inner container with overflow clipping */}
          <div className="flex size-full flex-col overflow-hidden">
            {/* Active tab content instance only. Hidden per-tab controls can
                retain focus or portal event handlers, so the control bar and
                content UI are mounted exclusively for the effective active tab. */}
            {effectiveActiveTabId &&
              visibleTabIds.includes(effectiveActiveTabId) && (
                <PerTabContent
                  key={effectiveActiveTabId}
                  ref={(ref) => {
                    tabContentRefs.current[effectiveActiveTabId] = ref;
                  }}
                  tabId={effectiveActiveTabId}
                />
              )}
          </div>
        </div>
      </div>
    </ResizablePanel>
  );
}
