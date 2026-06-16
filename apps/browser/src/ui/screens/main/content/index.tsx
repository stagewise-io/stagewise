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
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
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
import { TabErrorBoundary } from './_components/tab-error-boundary';
import { UnsavedFileCloseDialog } from './_components/unsaved-file-close-dialog';
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
import { Tutorial } from '@ui/components/tutorial';
import { useTutorial } from '@ui/contexts/tutorial';
import type { TutorialId } from '@ui/tutorial-steps';
import type { KartonContract, TabState } from '@shared/karton-contracts/ui';
import { HotkeyActions } from '@shared/hotkeys';
import {
  getFileTabUnsavedEditEntry,
  hasFileTabUnsavedEditEntry,
  subscribeUnsavedEdits,
  getUnsavedEditsVersion,
  type FileTabUnsavedEditEntry,
} from '../file-tree/file-tab-unsaved-edits';

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
      <span className="flex size-full items-center justify-center group-hover:opacity-0 group-data-[force-actions-visible=true]:opacity-0">
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
                'absolute inset-0 size-full text-subtle-foreground opacity-0 group-hover:opacity-100 group-data-[force-actions-visible=true]:opacity-100',
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
          <span className="flex items-center gap-1.5">
            <span>{isAttachedToCurrentAgent ? 'Pin globally' : 'Unpin'}</span>
            <HotkeyCombo action={HotkeyActions.TOGGLE_TAB_PIN} size="xs" />
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MainSection
// ---------------------------------------------------------------------------

export function MainSection({
  onCreateTab,
  pendingOmniboxFocusRequest,
  onPendingOmniboxFocusHandled,
  topRightActions,
  defaultSize = 70,
  onPanelResize,
}: {
  onCreateTab: () => void;
  pendingOmniboxFocusRequest: {
    id: number;
    fromTabId: string | null;
    targetTabId: string;
  } | null;
  onPendingOmniboxFocusHandled: (requestId: number) => void;
  topRightActions?: ReactNode;
  defaultSize?: number;
  onPanelResize?: (size: number) => void;
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
  const promoteFileTab = useKartonProcedure((p) => p.fileTree.promoteFileTab);
  const togglePanelKeyboardFocus = useKartonProcedure(
    (p) => p.browser.layout.togglePanelKeyboardFocus,
  );

  const { setTabUiState, removeTabUiState } = useTabUIState();
  const [openAgent] = useOpenAgent();
  const { activeTutorial } = useTutorial();
  const [pendingUnsavedClose, setPendingUnsavedClose] =
    useState<FileTabUnsavedEditEntry | null>(null);

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
  const prevOpenAgentRef = useRef(openAgent);
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

  const isActiveTabVisibleForAgent = useCallback((agentId: string) => {
    const curActiveId = activeTabIdRef.current;
    if (!curActiveId) return false;

    const currentTab = tabsRef.current[curActiveId];
    if (!currentTab) return false;

    return (
      currentTab.agentInstanceId === null ||
      currentTab.agentInstanceId === agentId
    );
  }, []);

  const reconcileActiveTabForAgent = useCallback(
    (agentId: string) => {
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
        if (currentTab.agentInstanceId === agentId) return;
      }

      // Need to switch — collect visible tab IDs for the agent
      const visibleIds = [
        ...curGlobalOrder.filter((id) => curTabs[id]?.agentInstanceId === null),
        ...(curAgentOrders[agentId] ?? []).filter(
          (id) => curTabs[id]?.agentInstanceId === agentId,
        ),
      ];

      // Prefer previously active tab for this agent
      const prevActive = curLastActive[agentId];
      if (
        prevActive &&
        curTabs[prevActive] &&
        visibleIds.includes(prevActive)
      ) {
        switchTab(prevActive);
        return;
      }

      // Prefer any agent-specific tab
      const agentTab = visibleIds.find(
        (id) => curTabs[id]?.agentInstanceId === agentId,
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
    },
    [switchTab],
  );

  useEffect(() => {
    const prevAgent = prevOpenAgentRef.current;
    prevOpenAgentRef.current = openAgent;

    if (!openAgent) return;

    if (prevAgent === openAgent) {
      if (!isActiveTabVisibleForAgent(openAgent)) {
        reconcileActiveTabForAgent(openAgent);
      }
      return;
    }

    reconcileActiveTabForAgent(openAgent);
  }, [
    openAgent,
    isActiveTabVisibleForAgent,
    reconcileActiveTabForAgent,
    globalOrder,
    agentOrders,
  ]);

  // ---------------------------------------------------------------------------
  // Optimistic tab order
  // useComparingSelector prevents a new array reference on every tab property
  // mutation (title / URL / loading state) — only the set/order of IDs matters.
  // ---------------------------------------------------------------------------

  const tabIdsSelector = useComparingSelector<KartonContract, string[]>(
    (s) => {
      // De-duplicate ids across the global + per-agent order arrays.
      // A tab id must NEVER appear twice in the rendered tab list: two
      // <Tabs.Tab> with the same `value` both match the active value and
      // their Base UI highlight effects ping-pong setHighlightedTabIndex
      // forever (React error #185 → whole-UI crash). The backend can
      // transiently hold an id in two arrays, so we mirror the dedupe
      // already done in WindowLayoutService.getAllOrderedTabIds().
      const seen = new Set<string>();
      const ids: string[] = [];
      const push = (id: string) => {
        if (seen.has(id)) return;
        seen.add(id);
        ids.push(id);
      };
      for (const id of s.contentTabs.globalOrder) push(id);
      for (const agentId of Object.keys(s.contentTabs.agentOrders).sort()) {
        for (const id of s.contentTabs.agentOrders[agentId] ?? []) push(id);
      }
      return ids;
    },
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
    // Final dedupe guard at the render boundary: even if the optimistic
    // order ever contains a duplicate id (e.g. from a reorder edge case),
    // never emit it twice. Rendering duplicate <Tabs.Tab value> crashes
    // the whole UI via an infinite Base UI highlight-effect loop (#185).
    const seen = new Set<string>();
    return optimisticTabIds.filter((id) => {
      if (seen.has(id)) return false;
      const tab = tabs[id];
      if (!tab) return false;
      if (tab.agentInstanceId !== null && tab.agentInstanceId !== openAgent) {
        return false;
      }
      seen.add(id);
      return true;
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

  const closeTabWithUnsavedCheck = useCallback(
    (id: string) => {
      const unsavedEntry = getFileTabUnsavedEditEntry(id);
      if (unsavedEntry) {
        setPendingUnsavedClose(unsavedEntry);
        return;
      }
      void closeTab(id);
      removeTabUiState(id);
    },
    [closeTab, removeTabUiState],
  );

  const closePendingUnsavedTab = useCallback(() => {
    if (!pendingUnsavedClose) return;
    const tabId = pendingUnsavedClose.tabId;
    void closeTab(tabId);
    removeTabUiState(tabId);
    setPendingUnsavedClose(null);
  }, [closeTab, pendingUnsavedClose, removeTabUiState]);

  // ---------------------------------------------------------------------------
  // Subscribe to unsaved-edits changes so the tab bar re-renders when
  // dirty state changes (no Karton field for this yet).
  useSyncExternalStore(subscribeUnsavedEdits, getUnsavedEditsVersion);

  // Build SortableTabItem[] from optimistic order + Karton tab state
  // ---------------------------------------------------------------------------
  const tutorialTabId = useMemo(
    () => effectiveActiveTabId ?? visibleTabIds[0] ?? null,
    [effectiveActiveTabId, visibleTabIds],
  );

  const shouldForceTabTutorialActions =
    activeTutorial?.id === ('content-tabs' satisfies TutorialId);

  const tabItems = useMemo<SortableTabItem[]>(() => {
    return visibleTabIds
      .map((id): SortableTabItem | null => {
        const tab = tabs[id];
        if (!tab) return null;
        return {
          id,
          label:
            tab.type === 'file' && tab.lifecycle.kind === 'temporary' ? (
              <span className="italic">{tab.title}</span>
            ) : (
              tab.title
            ),
          icon: <TabPinIcon tab={tab} openAgent={openAgent} />,
          onClose: () => closeTabWithUnsavedCheck(id),
          closeShortcut: (
            <HotkeyCombo action={HotkeyActions.CLOSE_TAB} size="xs" />
          ),
          onAuxClick: (e: React.MouseEvent) => {
            if (e.button !== 1) return;
            e.preventDefault();
            closeTabWithUnsavedCheck(id);
          },
          dirty:
            tab.type === 'file' ? hasFileTabUnsavedEditEntry(id) : undefined,
          onDoubleClick: () => {
            // Double-clicking a temporary (preview) file tab promotes it to a
            // permanent tab, matching the file-tree double-click behavior.
            if (tab.type === 'file' && tab.lifecycle.kind === 'temporary') {
              void promoteFileTab(id);
            }
          },
          tutorialId: id === tutorialTabId ? 'content-tab-item' : undefined,
          forceActionsVisible:
            id === tutorialTabId && shouldForceTabTutorialActions,
          actions:
            tab.type !== 'terminal' && (tab.isPlayingAudio || tab.isMuted) ? (
              <AudioMuteButton tab={tab} />
            ) : undefined,
          wrapTrigger: (inner: ReactElement) =>
            tab.type === 'file' ? (
              inner
            ) : tab.type === 'terminal' ? (
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
  }, [
    visibleTabIds,
    tabs,
    activeTabId,
    openAgent,
    tutorialTabId,
    shouldForceTabTutorialActions,
    closeTabWithUnsavedCheck,
    promoteFileTab,
  ]);

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
      defaultSize={defaultSize}
      minSize={20}
      onResize={(size) => {
        if (size > 0) onPanelResize?.(size);
      }}
      className="@container overflow-visible! relative flex h-full flex-1 flex-col items-start justify-between"
    >
      {visibleTabIds.length > 0 && <Tutorial tutorialId="content-tabs" />}
      <BrowserTabHotkeys
        onFocusUrlBar={handleFocusUrlBar}
        onFocusSearchBar={handleFocusSearchBar}
      />
      <div className="flex h-full w-full flex-col">
        {/* Tab bar */}
        <div className="flex shrink-0 flex-row items-center gap-1 border-derived-strong border-b bg-background py-1 pr-2 pl-1.5">
          <SortableTabs
            value={effectiveActiveTabId ?? ''}
            onValueChange={(id) => {
              if (id) void switchTab(id);
            }}
            ref={tabBarScrollRef}
            style={maskStyle}
            className="min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {/* Global (pinned) tabs — shrinks independently, inner scroll handles overflow */}
            {globalTabItems.length > 0 && (
              <SortableTabsList
                variant="bar"
                items={globalTabItems}
                onReorder={handleReorderGlobal}
                activeValue={effectiveActiveTabId ?? ''}
                className="min-w-0 shrink items-center"
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
                className="min-w-0 shrink items-center"
              />
            )}
          </SortableTabs>
          <div className="app-no-drag flex shrink-0 items-center gap-0.5">
            <NewTabButtons
              buttonClassName="size-7"
              onCreateBrowserTab={onCreateTab}
              onCreateTerminalTab={() =>
                void createTerminal(undefined, openAgent)
              }
            />
            {topRightActions}
          </div>
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
                <TabErrorBoundary
                  key={effectiveActiveTabId}
                  tabId={effectiveActiveTabId}
                >
                  <PerTabContent
                    ref={(ref) => {
                      tabContentRefs.current[effectiveActiveTabId] = ref;
                    }}
                    tabId={effectiveActiveTabId}
                  />
                </TabErrorBoundary>
              )}
          </div>
        </div>
      </div>
      <UnsavedFileCloseDialog
        entry={pendingUnsavedClose}
        onKeepOpen={() => setPendingUnsavedClose(null)}
        onCancelWithoutSave={() => {
          pendingUnsavedClose?.discard();
          closePendingUnsavedTab();
        }}
        onSaveAndClose={async () => {
          if (!pendingUnsavedClose) return;
          const saved = await pendingUnsavedClose.save();
          if (saved) closePendingUnsavedTab();
        }}
      />
    </ResizablePanel>
  );
}
