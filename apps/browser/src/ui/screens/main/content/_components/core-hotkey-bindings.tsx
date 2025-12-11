import { useHotKeyListener } from '@/hooks/use-hotkey-listener';
import { HotkeyActions } from '@shared/hotkeys';
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import { useCallback, useMemo } from 'react';

export function CoreHotkeyBindings({
  onCreateTab,
  onFocusUrlBar,
}: {
  onCreateTab: () => void;
  onFocusUrlBar: () => void;
}) {
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const tabs = useKartonState((s) => s.browser.tabs);

  const tabIds = useMemo(() => Object.keys(tabs), [tabs]);
  const tabCount = useMemo(() => tabIds.length, [tabIds]);

  const tabNeighborsToActiveTab = useMemo(() => {
    if (tabCount <= 1) return null;
    const currentIndex = tabIds.findIndex((id) => id === activeTabId);
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
  const toggleDevTools = useKartonProcedure((p) => p.browser.toggleDevTools);

  // TAB NAVIGATION

  // New tab
  useHotKeyListener(() => {
    onCreateTab();
  }, HotkeyActions.CTRL_T);

  // Close tab
  useHotKeyListener(() => {
    if (!activeTabId) return;
    closeTab(activeTabId);
  }, HotkeyActions.CTRL_W);

  // Switch to next tab
  const handleNextTab = useCallback(async () => {
    if (!tabNeighborsToActiveTab) return;
    await switchTab(tabNeighborsToActiveTab.next);
  }, [tabNeighborsToActiveTab, switchTab]);

  useHotKeyListener(handleNextTab, HotkeyActions.CTRL_TAB);
  useHotKeyListener(handleNextTab, HotkeyActions.CMD_OPTION_ARROW_RIGHT);
  useHotKeyListener(handleNextTab, HotkeyActions.CTRL_PAGE_DOWN);

  // Switch to previous tab
  const handlePreviousTab = useCallback(() => {
    if (!tabNeighborsToActiveTab) return;
    switchTab(tabNeighborsToActiveTab.previous);
  }, [tabNeighborsToActiveTab, switchTab]);

  useHotKeyListener(handlePreviousTab, HotkeyActions.CTRL_SHIFT_TAB);
  useHotKeyListener(handlePreviousTab, HotkeyActions.CMD_OPTION_ARROW_LEFT);
  useHotKeyListener(handlePreviousTab, HotkeyActions.CTRL_PAGE_UP);

  // Focus specific tabs (CTRL_1 through CTRL_9)
  const createTabIndexHandler = useCallback(
    (index: number) => {
      return () => {
        if (index === 9) {
          // CTRL_9 focuses last tab
          if (tabCount === 0) return;
          const lastTabId = tabIds[tabCount - 1];
          switchTab(lastTabId);
        } else {
          // CTRL_1-8 focus tabs by index (0-based)
          if (index >= tabCount) return;
          switchTab(tabIds[index]);
        }
      };
    },
    [tabIds, tabCount, switchTab],
  );

  useHotKeyListener(createTabIndexHandler(0), HotkeyActions.CTRL_1);
  useHotKeyListener(createTabIndexHandler(1), HotkeyActions.CTRL_2);
  useHotKeyListener(createTabIndexHandler(2), HotkeyActions.CTRL_3);
  useHotKeyListener(createTabIndexHandler(3), HotkeyActions.CTRL_4);
  useHotKeyListener(createTabIndexHandler(4), HotkeyActions.CTRL_5);
  useHotKeyListener(createTabIndexHandler(5), HotkeyActions.CTRL_6);
  useHotKeyListener(createTabIndexHandler(6), HotkeyActions.CTRL_7);
  useHotKeyListener(createTabIndexHandler(7), HotkeyActions.CTRL_8);
  useHotKeyListener(createTabIndexHandler(9), HotkeyActions.CTRL_9);

  // HISTORY NAVIGATION

  // Back in history
  const handleGoBack = useCallback(() => {
    if (!activeTabId) return;
    goBack(activeTabId);
  }, [activeTabId, goBack]);

  useHotKeyListener(handleGoBack, HotkeyActions.CMD_BRACKET_LEFT);
  useHotKeyListener(handleGoBack, HotkeyActions.CMD_ARROW_LEFT);
  useHotKeyListener(handleGoBack, HotkeyActions.ALT_ARROW_LEFT);

  // Forward in history
  const handleGoForward = useCallback(() => {
    if (!activeTabId) return;
    goForward(activeTabId);
  }, [activeTabId, goForward]);

  useHotKeyListener(handleGoForward, HotkeyActions.CMD_BRACKET_RIGHT);
  useHotKeyListener(handleGoForward, HotkeyActions.CMD_ARROW_RIGHT);
  useHotKeyListener(handleGoForward, HotkeyActions.ALT_ARROW_RIGHT);

  // PAGE ACTIONS

  // Reload page
  const handleReload = useCallback(() => {
    if (!activeTabId) return;
    reload(activeTabId);
  }, [activeTabId, reload]);

  useHotKeyListener(handleReload, HotkeyActions.CTRL_R);
  useHotKeyListener(handleReload, HotkeyActions.F5);
  useHotKeyListener(handleReload, HotkeyActions.CTRL_SHIFT_R);

  // Home page
  useHotKeyListener(() => {
    if (!activeTabId) return;
    goto('ui-main', activeTabId);
  }, HotkeyActions.CMD_SHIFT_H);

  // URL BAR

  // Focus URL bar
  useHotKeyListener(() => {
    onFocusUrlBar();
  }, HotkeyActions.CTRL_L);

  useHotKeyListener(() => {
    onFocusUrlBar();
  }, HotkeyActions.ALT_D);

  useHotKeyListener(() => {
    onFocusUrlBar();
  }, HotkeyActions.F6);

  // DEV TOOLS

  // Toggle dev tools
  const handleToggleDevTools = useCallback(() => {
    if (!activeTabId) return;
    toggleDevTools(activeTabId);
  }, [activeTabId, toggleDevTools]);

  useHotKeyListener(handleToggleDevTools, HotkeyActions.F12);
  useHotKeyListener(handleToggleDevTools, HotkeyActions.CTRL_SHIFT_J);
  useHotKeyListener(handleToggleDevTools, HotkeyActions.CMD_OPTION_I);

  return null;
}
