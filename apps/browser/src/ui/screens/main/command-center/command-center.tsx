import type { Patch } from 'immer';
import {
  getCurrentPlatform,
  HotkeyActions,
  hotkeyDefinitions,
  isEventMatch,
} from '@shared/hotkeys';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import { usePendingRemovals } from '@ui/hooks/use-pending-agent-removals';
import {
  COMMAND_CENTER_MODES,
  type AgentCommandItem,
  type CommandCenterItem,
  type TabCommandItem,
} from './command-center-model';
import { useCommandCenter } from './command-center-context';
import { dispatchAgentTitleRenamed } from '../_lib/agent-title-renamed-event';
import { dispatchAgentDeleted } from '../_lib/agent-deleted-event';
import { COMMAND_CENTER_FOCUS_REQUESTED_EVENT } from '../_lib/command-center-focus-event';
import { buildGroupedRows } from './command-center-rows';
import { useCommandCenterItems } from './sources/use-command-center-items';
import { CommandCenterFooter } from './_components/command-center-footer';
import { CommandCenterInput } from './_components/command-center-input';
import { CommandCenterOverlay } from './_components/command-center-overlay';
import { CommandCenterPanel } from './_components/command-center-panel';
import { CommandCenterResults } from './_components/command-center-results';

function stringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function hasActiveInputSelection(input: HTMLInputElement | null): boolean {
  if (!input || document.activeElement !== input) return false;
  return (
    input.selectionStart !== null &&
    input.selectionEnd !== null &&
    input.selectionStart !== input.selectionEnd
  );
}

const commandCenterModalActiveAttribute = 'data-command-center-modal-active';

export function CommandCenter() {
  const {
    isOpen,
    query,
    mode,
    selectFirstOnOpen,
    restoreFocusOnClose,
    close,
    setQuery,
    setMode,
  } = useCommandCenter();
  const [optimisticPinnedAgentIds, setOptimisticPinnedAgentIds] = useState<
    string[] | null
  >(null);
  const [optimisticAgentTitles, setOptimisticAgentTitles] = useState<
    Record<string, string>
  >({});
  const {
    pending: pendingRemovalAgentIds,
    add: addPendingRemoval,
    remove: removePendingRemoval,
  } = usePendingRemovals();
  const { items, isLoading, rawAgentTitles, refreshAgentHistory } =
    useCommandCenterItems({
      query,
      mode,
      optimisticAgentTitles,
      optimisticPinnedAgentIds,
      pendingRemovalAgentIds,
    });
  const activeTabId = useKartonState((s) => s.contentTabs.activeTabId);
  const activeTab = useKartonState((s) =>
    activeTabId ? (s.contentTabs.tabs[activeTabId] ?? null) : null,
  );
  const [openAgent, setOpenAgent] = useOpenAgent();
  const resumeAgent = useKartonProcedure((p) => p.agents.resume);
  const deleteAgent = useKartonProcedure((p) => p.agents.delete);
  const setAgentTitle = useKartonProcedure((p) => p.agents.setTitle);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const setLastOpenAgentId = useKartonProcedure(
    (p) => p.browser.setLastOpenAgentId,
  );
  const movePanelToForeground = useKartonProcedure(
    (p) => p.browser.layout.movePanelToForeground,
  );
  const togglePanelKeyboardFocus = useKartonProcedure(
    (p) => p.browser.layout.togglePanelKeyboardFocus,
  );
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const createTab = useKartonProcedure((p) => p.browser.createTab);
  const openSettings = useKartonProcedure((p) => p.appScreen.openSettings);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const setTabAgentInstance = useKartonProcedure(
    (p) => p.browser.setTabAgentInstance,
  );
  const { removeTabUiState, requestTerminalFocus } = useTabUIState();
  const pinnedAgentIds = useKartonState(
    useComparingSelector(
      (s) => s.preferences.sidebar.pinnedAgentIds,
      stringArraysEqual,
    ),
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [deleteConfirmationAgent, setDeleteConfirmationAgent] = useState<{
    agentId: string;
    title: string;
  } | null>(null);
  const [renamingAgentId, setRenamingAgentId] = useState<string | null>(null);
  const [hasInputSelection, setHasInputSelection] = useState(false);
  const rows = useMemo(() => buildGroupedRows(items, mode), [items, mode]);
  const visibleItemIndexes = useMemo(
    () => rows.filter((row) => row.type === 'item').map((row) => row.itemIndex),
    [rows],
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ignoreMouseUntilMoveRef = useRef(true);
  const movePanelToForegroundRef = useRef(movePanelToForeground);
  const togglePanelKeyboardFocusRef = useRef(togglePanelKeyboardFocus);
  movePanelToForegroundRef.current = movePanelToForeground;
  togglePanelKeyboardFocusRef.current = togglePanelKeyboardFocus;

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const focusInputIfAllowed = useCallback(() => {
    if (renamingAgentId) return;
    focusInput();
  }, [focusInput, renamingAgentId]);

  const restoreTabContentFocus = useCallback(() => {
    void movePanelToForegroundRef.current('tab-content');
    void togglePanelKeyboardFocusRef.current('tab-content').then(() => {
      if (activeTab?.type === 'terminal' && activeTabId) {
        requestTerminalFocus(activeTabId);
      }
    });
  }, [activeTab, activeTabId]);

  const dismissCommandCenter = useCallback(() => {
    close();
    if (restoreFocusOnClose) restoreTabContentFocus();
  }, [close, restoreFocusOnClose, restoreTabContentFocus]);

  const selectedItem = items[selectedIndex];
  const selectedAgent: AgentCommandItem | null =
    selectedItem?.kind === 'agent' ? selectedItem : null;
  const selectedTab: TabCommandItem | null =
    selectedItem?.kind === 'tab' ? selectedItem : null;
  const selectedPinnableTab =
    selectedTab && (selectedTab.agentInstanceId || openAgent)
      ? selectedTab
      : null;
  const canCopySelectedTabUrl = selectedTab !== null && !hasInputSelection;
  const canDeleteSelectedAgent =
    selectedAgent !== null && !selectedAgent.isWorking;

  useEffect(() => {
    if (!isOpen) return;
    document.body.setAttribute(commandCenterModalActiveAttribute, '');
    return () => {
      document.body.removeAttribute(commandCenterModalActiveAttribute);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    window.dispatchEvent(new Event(COMMAND_CENTER_FOCUS_REQUESTED_EVENT));
    void movePanelToForegroundRef.current('stagewise-ui');
    void togglePanelKeyboardFocusRef.current('stagewise-ui');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    ignoreMouseUntilMoveRef.current = true;
    setSelectedIndex(selectFirstOnOpen ? 0 : -1);
    setDeleteConfirmationAgent(null);
    setRenamingAgentId(null);
    focusInput();
  }, [focusInput, isOpen, mode, query, selectFirstOnOpen]);

  useEffect(() => {
    if (visibleItemIndexes.length === 0) {
      if (selectedIndex !== 0 && selectedIndex !== -1) setSelectedIndex(0);
      return;
    }

    if (selectedIndex === -1) return;
    if (visibleItemIndexes.includes(selectedIndex)) return;
    setSelectedIndex(visibleItemIndexes[0]!);
  }, [selectedIndex, visibleItemIndexes]);

  useEffect(() => {
    if (!optimisticPinnedAgentIds) return;
    if (stringArraysEqual(optimisticPinnedAgentIds, pinnedAgentIds)) {
      setOptimisticPinnedAgentIds(null);
    }
  }, [optimisticPinnedAgentIds, pinnedAgentIds]);

  useEffect(() => {
    const optimisticEntries = Object.entries(optimisticAgentTitles);
    if (optimisticEntries.length === 0) return;

    const staleAgentIds = optimisticEntries
      .filter(([agentId, title]) => rawAgentTitles[agentId] === title)
      .map(([agentId]) => agentId);
    if (staleAgentIds.length === 0) return;

    setOptimisticAgentTitles((current) => {
      const next = { ...current };
      for (const agentId of staleAgentIds) delete next[agentId];
      return next;
    });
  }, [optimisticAgentTitles, rawAgentTitles]);

  useEffect(() => {
    if (!deleteConfirmationAgent) return;
    const currentAgent = items.find(
      (item): item is AgentCommandItem =>
        item.kind === 'agent' &&
        item.agentId === deleteConfirmationAgent.agentId,
    );
    if (!currentAgent || currentAgent.isWorking) {
      setDeleteConfirmationAgent(null);
    }
  }, [deleteConfirmationAgent, items]);

  useEffect(() => {
    if (!renamingAgentId) return;
    const stillVisible = items.some(
      (item) => item.kind === 'agent' && item.agentId === renamingAgentId,
    );
    if (!stillVisible) setRenamingAgentId(null);
  }, [items, renamingAgentId]);

  const executeItem = useCallback(
    (item: CommandCenterItem) => {
      if (item.disabled) return;

      if (item.kind === 'agent') {
        setOpenAgent(item.agentId);
        void setLastOpenAgentId(item.agentId).then(() =>
          resumeAgent(item.agentId),
        );
      } else if (item.kind === 'tab') {
        const agentInstanceId = item.agentInstanceId;
        if (agentInstanceId) {
          setOpenAgent(agentInstanceId);
          void setLastOpenAgentId(agentInstanceId).then(() =>
            resumeAgent(agentInstanceId),
          );
        }
        void switchTab(item.tabId);
      } else if (item.kind === 'setting') {
        if (item.settingsRoute) {
          void openSettings(item.settingsRoute);
        } else if (item.url) {
          void createTab(item.url, true);
        }
      }

      dismissCommandCenter();
    },
    [
      createTab,
      openSettings,
      dismissCommandCenter,
      resumeAgent,
      setLastOpenAgentId,
      setOpenAgent,
      switchTab,
    ],
  );

  const togglePinnedAgent = useCallback(
    async (agent: AgentCommandItem) => {
      const basePinnedAgentIds = optimisticPinnedAgentIds ?? pinnedAgentIds;
      const nextPinnedAgentIds = agent.isPinned
        ? basePinnedAgentIds.filter((id) => id !== agent.agentId)
        : [
            agent.agentId,
            ...basePinnedAgentIds.filter((id) => id !== agent.agentId),
          ];

      if (stringArraysEqual(nextPinnedAgentIds, basePinnedAgentIds)) return;

      const patches: Patch[] = [
        {
          op: 'replace',
          path: ['sidebar', 'pinnedAgentIds'],
          value: nextPinnedAgentIds,
        },
      ];

      setOptimisticPinnedAgentIds(nextPinnedAgentIds);
      try {
        await updatePreferences(patches);
      } catch (err) {
        console.error('Failed to update pinned command-center agent:', err);
        setOptimisticPinnedAgentIds(null);
      }
    },
    [optimisticPinnedAgentIds, pinnedAgentIds, updatePreferences],
  );

  const requestRenameAgent = useCallback((agent: AgentCommandItem) => {
    setDeleteConfirmationAgent(null);
    setRenamingAgentId(agent.agentId);
  }, []);

  const cancelRenameAgent = useCallback(() => {
    setRenamingAgentId(null);
    focusInput();
  }, [focusInput]);

  const commitRenameAgent = useCallback(
    (agentId: string, newTitle: string) => {
      setRenamingAgentId(null);
      focusInput();
      setOptimisticAgentTitles((current) => ({
        ...current,
        [agentId]: newTitle,
      }));
      setAgentTitle(agentId, newTitle)
        .then(() => {
          dispatchAgentTitleRenamed({ agentId, title: newTitle });
        })
        .catch((err) => {
          console.error('Failed to rename command-center agent:', err);
          setOptimisticAgentTitles((current) => {
            const next = { ...current };
            delete next[agentId];
            return next;
          });
        });
    },
    [focusInput, setAgentTitle],
  );

  const updateInputSelectionState = useCallback((input: HTMLInputElement) => {
    setHasInputSelection(hasActiveInputSelection(input));
  }, []);

  const handleInputBlur = useCallback(
    (input: HTMLInputElement) => {
      updateInputSelectionState(input);
      focusInputIfAllowed();
    },
    [focusInputIfAllowed, updateInputSelectionState],
  );

  const handlePanelPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (renamingAgentId) return;
      if (event.target === inputRef.current) return;
      focusInput();
    },
    [focusInput, renamingAgentId],
  );

  const copyTabUrl = useCallback((tab: TabCommandItem) => {
    try {
      if (typeof navigator?.clipboard?.writeText !== 'function') {
        console.error(
          'Failed to copy command-center tab URL: Clipboard API unavailable.',
        );
        return;
      }

      navigator.clipboard.writeText(tab.url).catch((err) => {
        console.error('Failed to copy command-center tab URL:', err);
      });
    } catch (err) {
      console.error('Failed to copy command-center tab URL:', err);
    }
  }, []);

  const closeCommandCenterTab = useCallback(
    (tab: TabCommandItem) => {
      void closeTab(tab.tabId)
        .then(() => {
          removeTabUiState(tab.tabId);
        })
        .catch((err) => {
          console.error('Failed to close command-center tab:', err);
        });
    },
    [closeTab, removeTabUiState],
  );

  const togglePinnedTab = useCallback(
    (tab: TabCommandItem) => {
      // Pinned tab = global tab. Unpinning scopes it to the current agent.
      if (!tab.agentInstanceId) {
        if (!openAgent) return;
        void setTabAgentInstance(tab.tabId, openAgent);
        return;
      }

      void setTabAgentInstance(tab.tabId, null);
    },
    [openAgent, setTabAgentInstance],
  );

  const requestDeleteAgent = useCallback((agent: AgentCommandItem) => {
    if (agent.isWorking) return;

    setRenamingAgentId(null);
    setDeleteConfirmationAgent({
      agentId: agent.agentId,
      title: agent.title,
    });
  }, []);

  const confirmDeleteAgent = useCallback(() => {
    const agent = deleteConfirmationAgent;
    if (!agent) return;

    const currentAgent = items.find(
      (item): item is AgentCommandItem =>
        item.kind === 'agent' && item.agentId === agent.agentId,
    );
    if (!currentAgent || currentAgent.isWorking) {
      setDeleteConfirmationAgent(null);
      return;
    }

    setDeleteConfirmationAgent(null);
    addPendingRemoval(agent.agentId);

    deleteAgent(agent.agentId)
      .then(() => {
        dispatchAgentDeleted({ agentId: agent.agentId });
        return refreshAgentHistory();
      })
      .then(() => {
        removePendingRemoval(agent.agentId);
      })
      .catch((err) => {
        console.error('Failed to delete command-center agent:', err);
        removePendingRemoval(agent.agentId);
      });
  }, [
    addPendingRemoval,
    deleteAgent,
    deleteConfirmationAgent,
    items,
    refreshAgentHistory,
    removePendingRemoval,
  ]);

  const handleMouseMoved = useCallback(() => {
    ignoreMouseUntilMoveRef.current = false;
  }, []);

  const handleHoverIndex = useCallback((index: number) => {
    if (ignoreMouseUntilMoveRef.current) return;
    setSelectedIndex(index);
  }, []);

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      if (visibleItemIndexes.length === 0) return;
      ignoreMouseUntilMoveRef.current = true;
      setDeleteConfirmationAgent(null);
      setRenamingAgentId(null);
      setSelectedIndex((current) => {
        const currentVisibleIndex = visibleItemIndexes.indexOf(current);
        const fallbackIndex = direction === 1 ? -1 : 0;
        const baseIndex =
          currentVisibleIndex === -1 ? fallbackIndex : currentVisibleIndex;
        const nextVisibleIndex =
          (baseIndex + direction + visibleItemIndexes.length) %
          visibleItemIndexes.length;
        return visibleItemIndexes[nextVisibleIndex]!;
      });
    },
    [visibleItemIndexes],
  );

  const cycleMode = useCallback(
    (direction: 1 | -1) => {
      const index = COMMAND_CENTER_MODES.indexOf(mode);
      ignoreMouseUntilMoveRef.current = true;
      setDeleteConfirmationAgent(null);
      setRenamingAgentId(null);
      setMode(
        COMMAND_CENTER_MODES[
          (index + direction + COMMAND_CENTER_MODES.length) %
            COMMAND_CENTER_MODES.length
        ]!,
      );
    },
    [mode, setMode],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const platform = getCurrentPlatform();

      if (renamingAgentId) {
        if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if (deleteConfirmationAgent) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setDeleteConfirmationAgent(null);
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          confirmDeleteAgent();
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (
        selectedAgent &&
        isEventMatch(
          event.nativeEvent,
          hotkeyDefinitions[HotkeyActions.COMMAND_CENTER_RENAME_AGENT],
          platform,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        requestRenameAgent(selectedAgent);
        return;
      }

      if (
        selectedAgent &&
        isEventMatch(
          event.nativeEvent,
          hotkeyDefinitions[HotkeyActions.COMMAND_CENTER_TOGGLE_AGENT_PIN],
          platform,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        setDeleteConfirmationAgent(null);
        setRenamingAgentId(null);
        void togglePinnedAgent(selectedAgent);
        return;
      }

      if (
        canCopySelectedTabUrl &&
        selectedTab &&
        isEventMatch(
          event.nativeEvent,
          hotkeyDefinitions[HotkeyActions.COMMAND_CENTER_COPY_TAB_URL],
          platform,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        copyTabUrl(selectedTab);
        return;
      }

      if (
        selectedTab &&
        isEventMatch(
          event.nativeEvent,
          hotkeyDefinitions[HotkeyActions.CLOSE_TAB],
          platform,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        closeCommandCenterTab(selectedTab);
        return;
      }

      if (
        selectedPinnableTab &&
        isEventMatch(
          event.nativeEvent,
          hotkeyDefinitions[HotkeyActions.COMMAND_CENTER_TOGGLE_AGENT_PIN],
          platform,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        void togglePinnedTab(selectedPinnableTab);
        return;
      }

      if (
        canDeleteSelectedAgent &&
        selectedAgent &&
        isEventMatch(
          event.nativeEvent,
          hotkeyDefinitions[HotkeyActions.COMMAND_CENTER_DELETE_AGENT],
          platform,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        requestDeleteAgent(selectedAgent);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismissCommandCenter();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        const item = items[selectedIndex];
        if (item) executeItem(item);
        return;
      }

      if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n')) {
        event.preventDefault();
        event.stopPropagation();
        moveSelection(1);
        return;
      }

      if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p')) {
        event.preventDefault();
        event.stopPropagation();
        moveSelection(-1);
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        cycleMode(event.shiftKey ? -1 : 1);
      }
    },
    [
      canCopySelectedTabUrl,
      canDeleteSelectedAgent,
      close,
      closeCommandCenterTab,
      confirmDeleteAgent,
      copyTabUrl,
      cycleMode,
      deleteConfirmationAgent,
      dismissCommandCenter,
      executeItem,
      items,
      moveSelection,
      renamingAgentId,
      requestDeleteAgent,
      requestRenameAgent,
      selectedAgent,
      selectedIndex,
      selectedPinnableTab,
      selectedTab,
      togglePinnedAgent,
      togglePinnedTab,
    ],
  );

  if (!isOpen) return null;

  return (
    <CommandCenterOverlay onClose={dismissCommandCenter}>
      <div
        onKeyDownCapture={handleKeyDown}
        onPointerDownCapture={handlePanelPointerDownCapture}
      >
        <CommandCenterPanel>
          <CommandCenterInput
            ref={inputRef}
            query={query}
            mode={mode}
            onBlur={handleInputBlur}
            onQueryChange={setQuery}
            onModeChange={setMode}
            onSelectionChange={updateInputSelectionState}
          />
          <CommandCenterResults
            items={items}
            mode={mode}
            selectedIndex={selectedIndex}
            isLoading={isLoading}
            renamingAgentId={renamingAgentId}
            onCancelRename={cancelRenameAgent}
            onCommitRename={commitRenameAgent}
            onMouseMoved={handleMouseMoved}
            onSelect={executeItem}
            onHoverIndex={handleHoverIndex}
          />
          <CommandCenterFooter
            deleteConfirmation={deleteConfirmationAgent}
            isRenamingAgent={renamingAgentId !== null}
            selectedAgent={selectedAgent}
            canCopySelectedTabUrl={canCopySelectedTabUrl}
            canToggleSelectedTabPin={selectedPinnableTab !== null}
            selectedTab={selectedTab}
          />
        </CommandCenterPanel>
      </div>
    </CommandCenterOverlay>
  );
}
