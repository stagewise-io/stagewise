import { HotkeyActions } from '@shared/hotkeys';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import { useCallback } from 'react';
import { useContentCollapsed } from './content-collapsed-context';
import { useOpenAgent } from '@ui/hooks/use-open-chat';

/**
 * Agent-scoped hotkeys — always mounted. Handles tab management attached
 * to the current agent and content-panel toggling. Handlers are no-ops
 * when there is no active browser tab.
 */
export function AgentHotkeyBindings() {
  // -- Content panel toggle (Mod+Alt+B) ----------------------------------
  const { collapsed: contentCollapsed, setCollapsed: setContentCollapsed } =
    useContentCollapsed();

  useHotKeyListener(() => {
    setContentCollapsed(!contentCollapsed);
  }, HotkeyActions.TOGGLE_CONTENT_PANEL);

  // -- Tab management (per-agent) ---------------------------------------
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const tabs = useKartonState((s) => s.browser.tabs);
  const createTab = useKartonProcedure((p) => p.browser.createTab);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const { removeTabUiState } = useTabUIState();

  // Mod+T: new tab (attached to current agent, opens content panel)
  const [openAgent] = useOpenAgent();
  useHotKeyListener(() => {
    if (contentCollapsed) setContentCollapsed(false);
    createTab(undefined, undefined, openAgent);
  }, HotkeyActions.NEW_TAB);

  // Mod+Shift+T: restore last closed tab (TODO: implement browser.restoreTab)

  // Mod+W: close active tab
  useHotKeyListener(() => {
    if (!activeTabId) return;
    closeTab(activeTabId);
    removeTabUiState(activeTabId);
  }, HotkeyActions.CLOSE_TAB);

  // -- Content panel tab navigation (Mod+Alt+PageDown / Mod+Alt+PageUp) --
  const tabIds = Object.keys(tabs);

  const switchToTabByIndex = useCallback(
    (index: number) => {
      const id = tabIds[index];
      if (id) void switchTab(id);
    },
    [tabIds, switchTab],
  );

  const cycleTab = useCallback(
    (direction: 'next' | 'previous') => {
      if (tabIds.length <= 1 || !activeTabId) return;
      const idx = tabIds.indexOf(activeTabId);
      if (idx === -1) return;
      const nextIdx =
        direction === 'next'
          ? (idx + 1) % tabIds.length
          : (idx - 1 + tabIds.length) % tabIds.length;
      void switchTab(tabIds[nextIdx]!);
    },
    [tabIds, activeTabId, switchTab],
  );

  useHotKeyListener(() => cycleTab('next'), HotkeyActions.NEXT_TAB);
  useHotKeyListener(() => cycleTab('previous'), HotkeyActions.PREV_TAB);

  // -- Agent-scoped tab focus (Mod+Alt+1-9) -----------------------------
  useHotKeyListener(() => switchToTabByIndex(0), HotkeyActions.FOCUS_TAB_1);
  useHotKeyListener(() => switchToTabByIndex(1), HotkeyActions.FOCUS_TAB_2);
  useHotKeyListener(() => switchToTabByIndex(2), HotkeyActions.FOCUS_TAB_3);
  useHotKeyListener(() => switchToTabByIndex(3), HotkeyActions.FOCUS_TAB_4);
  useHotKeyListener(() => switchToTabByIndex(4), HotkeyActions.FOCUS_TAB_5);
  useHotKeyListener(() => switchToTabByIndex(5), HotkeyActions.FOCUS_TAB_6);
  useHotKeyListener(() => switchToTabByIndex(6), HotkeyActions.FOCUS_TAB_7);
  useHotKeyListener(() => switchToTabByIndex(7), HotkeyActions.FOCUS_TAB_8);
  useHotKeyListener(() => switchToTabByIndex(8), HotkeyActions.FOCUS_TAB_9);

  // TOGGLE_CONTEXT_SELECTOR (Mod+I) is handled inline in panel-footer.tsx
  // because it depends on local chat-input state. It guards on content
  // panel visibility + active browser tab internally.

  return null;
}
