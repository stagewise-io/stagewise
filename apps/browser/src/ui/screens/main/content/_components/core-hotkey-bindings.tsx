import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { HotkeyActions } from '@shared/hotkeys';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useCallback, useMemo } from 'react';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import { HOME_PAGE_URL } from '@shared/internal-urls';
import { useSidebarCollapsed } from '../../_components/sidebar-collapsed-context';
import { produceWithPatches, enablePatches } from 'immer';

enablePatches();

export function CoreHotkeyBindings({
  onCreateTab,
  onFocusUrlBar,
  onFocusSearchBar,
  onCleanAllTabs,
}: {
  onCreateTab: () => void;
  onFocusUrlBar: () => void;
  onFocusSearchBar: () => void;
  onCleanAllTabs: () => void;
}) {
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const tabs = useKartonState((s) => s.browser.tabs);
  const { removeTabUiState } = useTabUIState();
  const togglePanelKeyboardFocus = useKartonProcedure(
    (p) => p.browser.layout.togglePanelKeyboardFocus,
  );
  const { toggle: toggleSidebar } = useSidebarCollapsed();
  const tabIds = useMemo(() => Object.keys(tabs), [tabs]);
  const tabCount = useMemo(() => tabIds.length, [tabIds]);

  const tabNeighborsToActiveTab = useMemo(() => {
    if (tabCount <= 1) return null;
    const currentIndex = tabIds.indexOf(activeTabId as string);
    return {
      previous: tabIds[(currentIndex - 1 + tabCount) % tabCount],
      next: tabIds[(currentIndex + 1) % tabCount],
    };
  }, [activeTabId, tabIds, tabCount]);

  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const goBack = useKartonProcedure((p) => p.browser.goBack);
  const goForward = useKartonProcedure((p) => p.browser.goForward);
  const reload = useKartonProcedure((p) => p.browser.reload);
  const goto = useKartonProcedure((p) => p.browser.goto);
  const toggleDevTools = useKartonProcedure((p) => p.browser.devTools.toggle);
  const setZoomPercentage = useKartonProcedure(
    (p) => p.browser.setZoomPercentage,
  );
  const { tabUiState } = useTabUIState();

  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const uiZoomPercentage = useKartonState(
    (s) => s.preferences.general.uiZoomPercentage,
  );
  const focusedPanel = activeTabId
    ? (tabUiState[activeTabId]?.focusedPanel ?? 'stagewise-ui')
    : 'stagewise-ui';

  const currentZoomPercentage = useKartonState((s) =>
    activeTabId ? s.browser.tabs[activeTabId]?.zoomPercentage : 100,
  );
  const newTabPagePreference = useKartonState(
    (s) => s.preferences.general.newTabPage,
  );

  const handleSwitchTab = useCallback(
    async (tabId: string) => {
      const focus = tabUiState[tabId]?.focusedPanel ?? 'stagewise-ui';
      await switchTab(tabId);
      void togglePanelKeyboardFocus(focus);
    },
    [togglePanelKeyboardFocus, switchTab, tabUiState],
  );

  // TAB NAVIGATION

  // New tab
  useHotKeyListener(() => {
    togglePanelKeyboardFocus('stagewise-ui');
    onCreateTab();
  }, HotkeyActions.NEW_TAB);

  // Close tab
  useHotKeyListener(() => {
    if (!activeTabId) return;
    closeTab(activeTabId);
    removeTabUiState(activeTabId);
  }, HotkeyActions.CLOSE_TAB);

  // Close all tabs except active
  useHotKeyListener(() => {
    onCleanAllTabs();
  }, HotkeyActions.CLOSE_WINDOW);

  // Switch to next browser tab (Mod+PageDown / Mac Cmd+Alt+ArrowRight).
  // Ctrl+Tab is no longer bound here — it now drives agent switching
  // (see `agent-hotkey-bindings.tsx`).
  const handleNextTab = useCallback(async () => {
    if (!tabNeighborsToActiveTab?.next) return;
    await handleSwitchTab(tabNeighborsToActiveTab.next);
  }, [tabNeighborsToActiveTab, handleSwitchTab]);

  useHotKeyListener(handleNextTab, HotkeyActions.NEXT_TAB);

  // Switch to previous browser tab (Mod+PageUp / Mac Cmd+Alt+ArrowLeft).
  const handlePreviousTab = useCallback(() => {
    if (!tabNeighborsToActiveTab?.previous) return;
    handleSwitchTab(tabNeighborsToActiveTab.previous);
  }, [tabNeighborsToActiveTab, handleSwitchTab]);

  useHotKeyListener(handlePreviousTab, HotkeyActions.PREV_TAB);

  // Mod+1…9 are no longer browser-tab index jumps — they focus agents now
  // (see `agent-hotkey-bindings.tsx`).

  // HISTORY NAVIGATION

  // Back in history (aliases handled in definition: Alt+Left, Mod+Left on Mac, Mod+[ on Mac)
  const handleGoBack = useCallback(() => {
    if (!activeTabId) return;
    goBack(activeTabId);
  }, [activeTabId, goBack]);

  useHotKeyListener(handleGoBack, HotkeyActions.HISTORY_BACK);

  // Forward in history (aliases handled in definition)
  const handleGoForward = useCallback(() => {
    if (!activeTabId) return;
    goForward(activeTabId);
  }, [activeTabId, goForward]);

  useHotKeyListener(handleGoForward, HotkeyActions.HISTORY_FORWARD);

  // PAGE ACTIONS

  // Reload page (aliases: Mod+R, F5)
  const handleReload = useCallback(() => {
    if (!activeTabId) return;
    reload(activeTabId);
  }, [activeTabId, reload]);

  useHotKeyListener(handleReload, HotkeyActions.RELOAD);

  // Hard reload (Mod+Shift+R)
  useHotKeyListener(handleReload, HotkeyActions.HARD_RELOAD);

  // Home page
  useHotKeyListener(() => {
    if (!activeTabId) return;
    const homeUrl =
      newTabPagePreference.type === 'custom' && newTabPagePreference.customUrl
        ? newTabPagePreference.customUrl
        : HOME_PAGE_URL;
    goto(homeUrl, activeTabId);
  }, HotkeyActions.HOME_PAGE);

  // URL BAR

  // Focus URL bar (aliases: Mod+L, Alt+D, F6)
  useHotKeyListener(() => {
    togglePanelKeyboardFocus('stagewise-ui');
    onFocusUrlBar();
  }, HotkeyActions.FOCUS_URL_BAR);

  // SEARCH BAR

  // Focus search bar (aliases: Mod+F, F3)
  useHotKeyListener(() => {
    togglePanelKeyboardFocus('stagewise-ui');
    onFocusSearchBar();
  }, HotkeyActions.FIND_IN_PAGE);

  // DEV TOOLS

  // Toggle dev tools (aliases: F12, Ctrl+Shift+I/J, Mod+Alt+I on Mac)
  const handleToggleDevTools = useCallback(() => {
    if (!activeTabId) return;
    toggleDevTools(activeTabId);
  }, [activeTabId, toggleDevTools]);

  useHotKeyListener(handleToggleDevTools, HotkeyActions.DEV_TOOLS);

  // ZOOM

  // Zoom in
  const handleZoomIn = useCallback(() => {
    if (focusedPanel === 'tab-content') {
      // Per-tab web content zoom
      if (!activeTabId || !currentZoomPercentage) return;
      if (currentZoomPercentage >= 500) return;
      setZoomPercentage(currentZoomPercentage + 10, activeTabId);
    } else {
      // UI zoom
      if (uiZoomPercentage >= 130) return;
      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.general.uiZoomPercentage = Math.min(uiZoomPercentage + 10, 130);
      });
      void updatePreferences(patches);
    }
  }, [
    focusedPanel,
    activeTabId,
    currentZoomPercentage,
    uiZoomPercentage,
    setZoomPercentage,
    preferences,
    updatePreferences,
  ]);

  useHotKeyListener(handleZoomIn, HotkeyActions.ZOOM_IN);

  // Zoom out
  const handleZoomOut = useCallback(() => {
    if (focusedPanel === 'tab-content') {
      // Per-tab web content zoom
      if (!activeTabId || !currentZoomPercentage) return;
      if (currentZoomPercentage <= 50) return;
      setZoomPercentage(currentZoomPercentage - 10, activeTabId);
    } else {
      // UI zoom
      if (uiZoomPercentage <= 70) return;
      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.general.uiZoomPercentage = Math.max(uiZoomPercentage - 10, 70);
      });
      void updatePreferences(patches);
    }
  }, [
    focusedPanel,
    activeTabId,
    currentZoomPercentage,
    uiZoomPercentage,
    setZoomPercentage,
    preferences,
    updatePreferences,
  ]);

  useHotKeyListener(handleZoomOut, HotkeyActions.ZOOM_OUT);

  // Reset zoom
  const handleResetZoom = useCallback(() => {
    if (focusedPanel === 'tab-content') {
      // Per-tab web content zoom
      if (!activeTabId) return;
      setZoomPercentage(100, activeTabId);
    } else {
      // UI zoom
      if (uiZoomPercentage === 100) return;
      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.general.uiZoomPercentage = 100;
      });
      void updatePreferences(patches);
    }
  }, [
    focusedPanel,
    activeTabId,
    uiZoomPercentage,
    setZoomPercentage,
    preferences,
    updatePreferences,
  ]);

  useHotKeyListener(handleResetZoom, HotkeyActions.ZOOM_RESET);

  // SIDEBAR

  // Toggle sidebar collapsed state (Mod+B).
  useHotKeyListener(() => {
    toggleSidebar();
  }, HotkeyActions.TOGGLE_SIDEBAR);

  return null;
}
