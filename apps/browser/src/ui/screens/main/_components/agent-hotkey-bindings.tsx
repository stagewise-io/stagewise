import { HotkeyActions } from '@shared/hotkeys';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import { useCallback } from 'react';
import { useContentCollapsed } from './content-collapsed-context';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useCommandCenter } from '../command-center';

/**
 * Agent-scoped hotkeys — always mounted. Handles tab management attached
 * to the current agent and content-panel toggling. Handlers are no-ops
 * when there is no active browser tab.
 */
export function AgentHotkeyBindings({
  onCreateTab,
  onCreateTerminalTab,
}: {
  onCreateTab: () => void;
  onCreateTerminalTab: () => Promise<string | null>;
}) {
  // -- Content panel toggle (Mod+Alt+B) ----------------------------------
  const { collapsed: contentCollapsed, setCollapsed: setContentCollapsed } =
    useContentCollapsed();
  const { isOpen: isCommandCenterOpen } = useCommandCenter();
  const agentHotkeysEnabled = !isCommandCenterOpen;

  useHotKeyListener(
    () => {
      setContentCollapsed(!contentCollapsed);
    },
    HotkeyActions.TOGGLE_CONTENT_PANEL,
    agentHotkeysEnabled,
  );

  // -- Tab management (per-agent) ---------------------------------------
  const activeTabId = useKartonState((s) => s.contentTabs.activeTabId);
  const tabs = useKartonState((s) => s.contentTabs.tabs);
  const globalOrder = useKartonState((s) => s.contentTabs.globalOrder);
  const agentOrders = useKartonState((s) => s.contentTabs.agentOrders);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const { tabUiState, requestTerminalFocus, removeTabUiState } =
    useTabUIState();

  // Mod+T: new tab (attached to current agent, opens content panel)
  const [openAgent] = useOpenAgent();
  useHotKeyListener(
    () => {
      if (contentCollapsed) setContentCollapsed(false);
      onCreateTab();
    },
    HotkeyActions.NEW_TAB,
    agentHotkeysEnabled,
  );

  const createTerminalTabSafely = useCallback(
    () => onCreateTerminalTab().catch(() => null),
    [onCreateTerminalTab],
  );

  // Mod+Alt+T: new terminal tab
  useHotKeyListener(
    () => {
      if (contentCollapsed) setContentCollapsed(false);
      void createTerminalTabSafely();
    },
    HotkeyActions.NEW_TERMINAL_TAB,
    agentHotkeysEnabled,
  );

  // Mod+W: close active tab
  useHotKeyListener(
    () => {
      if (!activeTabId) return;
      closeTab(activeTabId);
      removeTabUiState(activeTabId);
    },
    HotkeyActions.CLOSE_TAB,
    agentHotkeysEnabled,
  );

  // -- Content panel tab navigation (Mod+Alt+PageDown / Mod+Alt+PageUp) --
  // Only tabs visible for the current agent (global + agent-attached), in
  // the same order as the rendered tab bar.
  const visibleTabIds = [
    ...globalOrder.filter((id) => tabs[id]?.agentInstanceId === null),
    ...(openAgent ? (agentOrders[openAgent] ?? []) : []).filter(
      (id) => tabs[id]?.agentInstanceId === openAgent,
    ),
  ];
  const visibleTerminalIds = visibleTabIds.filter(
    (id) => tabs[id]?.type === 'terminal',
  );

  const focusTerminal = useCallback(
    (terminalId: string) => {
      void switchTab(terminalId);
      requestTerminalFocus(terminalId);
    },
    [requestTerminalFocus, switchTab],
  );

  const getNextTerminalId = useCallback(() => {
    if (visibleTerminalIds.length === 0) return null;
    if (!activeTabId) return visibleTerminalIds[0] ?? null;

    const activeVisibleIndex = visibleTabIds.indexOf(activeTabId);
    if (activeVisibleIndex === -1) return visibleTerminalIds[0] ?? null;

    return (
      visibleTerminalIds.find(
        (terminalId) => visibleTabIds.indexOf(terminalId) > activeVisibleIndex,
      ) ??
      visibleTerminalIds[0] ??
      null
    );
  }, [activeTabId, visibleTabIds, visibleTerminalIds]);

  const switchToTabByIndex = useCallback(
    (index: number) => {
      const id = visibleTabIds[index];
      if (id) void switchTab(id);
    },
    [visibleTabIds, switchTab],
  );

  useHotKeyListener(
    () => {
      const activeTab = activeTabId ? tabs[activeTabId] : undefined;
      const activeTabIsVisibleTerminal =
        !!activeTabId &&
        activeTab?.type === 'terminal' &&
        visibleTerminalIds.includes(activeTabId);
      const activeTerminalFocused =
        !!activeTabId &&
        tabUiState[activeTabId]?.focusedPanel === 'tab-content';
      const nextTerminalId = getNextTerminalId();

      if (visibleTerminalIds.length === 0) {
        if (contentCollapsed) setContentCollapsed(false);
        void createTerminalTabSafely().then((terminalId) => {
          if (terminalId) requestTerminalFocus(terminalId);
        });
        return;
      }

      if (contentCollapsed) {
        setContentCollapsed(false);
        focusTerminal(
          activeTabIsVisibleTerminal
            ? activeTabId
            : (nextTerminalId ?? visibleTerminalIds[0]!),
        );
        return;
      }

      if (activeTabIsVisibleTerminal && activeTerminalFocused) {
        setContentCollapsed(true);
        return;
      }

      if (activeTabIsVisibleTerminal) {
        requestTerminalFocus(activeTabId);
        return;
      }

      if (nextTerminalId) focusTerminal(nextTerminalId);
    },
    HotkeyActions.FOCUS_OR_TOGGLE_TERMINAL,
    agentHotkeysEnabled,
  );

  const cycleTab = useCallback(
    (direction: 'next' | 'previous') => {
      if (visibleTabIds.length <= 1 || !activeTabId) return;
      const idx = visibleTabIds.indexOf(activeTabId);
      if (idx === -1) return;
      const nextIdx =
        direction === 'next'
          ? (idx + 1) % visibleTabIds.length
          : (idx - 1 + visibleTabIds.length) % visibleTabIds.length;
      void switchTab(visibleTabIds[nextIdx]!);
    },
    [visibleTabIds, activeTabId, switchTab],
  );

  useHotKeyListener(
    () => cycleTab('next'),
    HotkeyActions.NEXT_TAB,
    agentHotkeysEnabled,
  );
  useHotKeyListener(
    () => cycleTab('previous'),
    HotkeyActions.PREV_TAB,
    agentHotkeysEnabled,
  );

  // -- Agent-scoped tab focus (Mod+Alt+1-9) -----------------------------
  useHotKeyListener(
    () => switchToTabByIndex(0),
    HotkeyActions.FOCUS_TAB_1,
    agentHotkeysEnabled,
  );
  useHotKeyListener(
    () => switchToTabByIndex(1),
    HotkeyActions.FOCUS_TAB_2,
    agentHotkeysEnabled,
  );
  useHotKeyListener(
    () => switchToTabByIndex(2),
    HotkeyActions.FOCUS_TAB_3,
    agentHotkeysEnabled,
  );
  useHotKeyListener(
    () => switchToTabByIndex(3),
    HotkeyActions.FOCUS_TAB_4,
    agentHotkeysEnabled,
  );
  useHotKeyListener(
    () => switchToTabByIndex(4),
    HotkeyActions.FOCUS_TAB_5,
    agentHotkeysEnabled,
  );
  useHotKeyListener(
    () => switchToTabByIndex(5),
    HotkeyActions.FOCUS_TAB_6,
    agentHotkeysEnabled,
  );
  useHotKeyListener(
    () => switchToTabByIndex(6),
    HotkeyActions.FOCUS_TAB_7,
    agentHotkeysEnabled,
  );
  useHotKeyListener(
    () => switchToTabByIndex(7),
    HotkeyActions.FOCUS_TAB_8,
    agentHotkeysEnabled,
  );
  useHotKeyListener(
    () => switchToTabByIndex(8),
    HotkeyActions.FOCUS_TAB_9,
    agentHotkeysEnabled,
  );

  // TOGGLE_CONTEXT_SELECTOR (Mod+I) is handled inline in panel-footer.tsx
  // because it depends on local chat-input state. It guards on content
  // panel visibility + active browser tab internally.

  return null;
}
