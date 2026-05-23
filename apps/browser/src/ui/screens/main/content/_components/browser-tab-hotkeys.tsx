import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { HotkeyActions } from '@shared/hotkeys';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import { produceWithPatches, enablePatches } from 'immer';
import { useEffect, useRef } from 'react';

enablePatches();

/**
 * Browser-tab–scoped hotkeys — mounted per content panel. Handles
 * per-tab web actions: history navigation, page reload, find, dev tools,
 * zoom, and URL bar focus.
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

  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const uiZoomPercentage = useKartonState(
    (s) => s.preferences.general.uiZoomPercentage,
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

  // Zoom helpers
  useHotKeyListener(() => {
    if (focusedPanel === 'tab-content') {
      if (!activeTabId || !currentZoomPercentage || isTerminalTab) return;
      if (currentZoomPercentage >= 500) return;
      setZoomPercentage(currentZoomPercentage + 10, activeTabId);
    } else {
      if (uiZoomPercentage >= 130) return;
      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.general.uiZoomPercentage = Math.min(uiZoomPercentage + 10, 130);
      });
      void updatePreferences(patches);
    }
  }, HotkeyActions.ZOOM_IN);

  useHotKeyListener(() => {
    if (focusedPanel === 'tab-content') {
      if (!activeTabId || !currentZoomPercentage || isTerminalTab) return;
      if (currentZoomPercentage <= 50) return;
      setZoomPercentage(currentZoomPercentage - 10, activeTabId);
    } else {
      if (uiZoomPercentage <= 70) return;
      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.general.uiZoomPercentage = Math.max(uiZoomPercentage - 10, 70);
      });
      void updatePreferences(patches);
    }
  }, HotkeyActions.ZOOM_OUT);

  useHotKeyListener(() => {
    if (focusedPanel === 'tab-content') {
      if (!activeTabId || isTerminalTab) return;
      setZoomPercentage(100, activeTabId);
    } else {
      if (uiZoomPercentage === 100) return;
      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.general.uiZoomPercentage = 100;
      });
      void updatePreferences(patches);
    }
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
