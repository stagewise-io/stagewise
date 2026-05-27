import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { HotkeyActions } from '@shared/hotkeys';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import { useEffect, useRef } from 'react';

/**
 * Browser-tab–scoped hotkeys — mounted per content panel. Handles
 * per-tab web actions: history navigation, page reload, find, dev tools,
 * tab-content zoom, and URL bar focus.
 */
export function BrowserTabHotkeys({
  onFocusUrlBar,
  onFocusSearchBar,
}: {
  onFocusUrlBar: () => void;
  onFocusSearchBar: () => void;
}) {
  const activeTabId = useKartonState((s) => s.contentTabs.activeTabId);
  const activeTabIdRef = useRef(activeTabId);
  const { tabUiState } = useTabUIState();
  const focusedPanel = activeTabId
    ? (tabUiState[activeTabId]?.focusedPanel ?? 'stagewise-ui')
    : 'stagewise-ui';

  const togglePanelKeyboardFocus = useKartonProcedure(
    (p) => p.browser.layout.togglePanelKeyboardFocus,
  );
  const goBack = useKartonProcedure((p) => p.browser.goBack);
  const goForward = useKartonProcedure((p) => p.browser.goForward);
  const reload = useKartonProcedure((p) => p.browser.reload);
  const toggleDevTools = useKartonProcedure((p) => p.browser.devTools.toggle);
  const setZoomPercentage = useKartonProcedure(
    (p) => p.browser.setZoomPercentage,
  );

  const currentZoomPercentage = useKartonState((s) =>
    activeTabId ? s.contentTabs.tabs[activeTabId]?.zoomPercentage : 100,
  );

  // Browser-specific hotkeys are no-ops for terminal tabs.
  const isTerminalTab = useKartonState((s) =>
    activeTabId ? s.contentTabs.tabs[activeTabId]?.type === 'terminal' : false,
  );

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // Tab-content zoom — applies to both browser and terminal tabs.
  // When keyboard focus is inside the tab content (not stagewise UI).
  // Returns false when stagewise-ui has focus so GlobalHotkeyBindings
  // (registered earlier in the same capture phase) handles UI zoom.
  useHotKeyListener(() => {
    if (focusedPanel !== 'tab-content') return false;
    if (!activeTabId || !currentZoomPercentage) return;
    const max = isTerminalTab ? 150 : 500;
    if (currentZoomPercentage >= max) return;
    setZoomPercentage(currentZoomPercentage + 10, activeTabId);
  }, HotkeyActions.ZOOM_IN);

  useHotKeyListener(() => {
    if (focusedPanel !== 'tab-content') return false;
    if (!activeTabId || !currentZoomPercentage) return;
    if (currentZoomPercentage <= 50) return;
    setZoomPercentage(currentZoomPercentage - 10, activeTabId);
  }, HotkeyActions.ZOOM_OUT);

  useHotKeyListener(() => {
    if (focusedPanel !== 'tab-content') return false;
    if (!activeTabId) return;
    setZoomPercentage(100, activeTabId);
  }, HotkeyActions.ZOOM_RESET);

  // URL bar (Mod+Alt+L): always focus the omnibox.
  useHotKeyListener(async () => {
    if (isTerminalTab) return;
    const targetTabId = activeTabId;
    try {
      await togglePanelKeyboardFocus('stagewise-ui');
    } catch {
      // Still focus the omnibox if the panel-focus handoff fails.
    }
    if (activeTabIdRef.current !== targetTabId) return;
    onFocusUrlBar();
  }, HotkeyActions.FOCUS_URL_BAR);

  // Search bar
  useHotKeyListener(() => {
    if (isTerminalTab) return;
    togglePanelKeyboardFocus('stagewise-ui');
    onFocusSearchBar();
  }, HotkeyActions.FIND_IN_PAGE);

  // History navigation
  useHotKeyListener(() => {
    if (!activeTabId || isTerminalTab) return;
    goBack(activeTabId);
  }, HotkeyActions.HISTORY_BACK);

  useHotKeyListener(() => {
    if (!activeTabId || isTerminalTab) return;
    goForward(activeTabId);
  }, HotkeyActions.HISTORY_FORWARD);

  // Page reload
  useHotKeyListener(() => {
    if (!activeTabId || isTerminalTab) return;
    reload(activeTabId);
  }, HotkeyActions.RELOAD);

  useHotKeyListener(() => {
    if (!activeTabId || isTerminalTab) return;
    reload(activeTabId);
  }, HotkeyActions.HARD_RELOAD);

  // Dev tools
  useHotKeyListener(() => {
    if (!activeTabId || isTerminalTab) return;
    toggleDevTools(activeTabId);
  }, HotkeyActions.DEV_TOOLS);

  return null;
}
