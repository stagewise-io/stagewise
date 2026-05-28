import { HotkeyActions } from '@shared/hotkeys';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useCommandCenter } from './command-center-context';

export function CommandCenterHotkeys() {
  const { close, isOpen, open, restoreFocusOnClose } = useCommandCenter();
  const [openAgent] = useOpenAgent();
  const activeTabId = useKartonState((s) => s.contentTabs.activeTabId);
  const activeTab = useKartonState((s) =>
    activeTabId ? (s.contentTabs.tabs[activeTabId] ?? null) : null,
  );
  const { tabUiState, requestTerminalFocus } = useTabUIState();
  const isActiveTabVisible =
    !!activeTab &&
    (activeTab.agentInstanceId === null ||
      activeTab.agentInstanceId === openAgent);
  const shouldRestoreFocusOnClose =
    isActiveTabVisible && activeTabId
      ? tabUiState[activeTabId]?.focusedPanel === 'tab-content'
      : false;
  const movePanelToForeground = useKartonProcedure(
    (p) => p.browser.layout.movePanelToForeground,
  );
  const togglePanelKeyboardFocus = useKartonProcedure(
    (p) => p.browser.layout.togglePanelKeyboardFocus,
  );

  useHotKeyListener(() => {
    if (!isOpen) {
      open({ restoreFocusOnClose: shouldRestoreFocusOnClose });
      return;
    }

    close();
    if (!restoreFocusOnClose) return;
    void movePanelToForeground('tab-content');
    void togglePanelKeyboardFocus('tab-content').then(() => {
      if (activeTab?.type === 'terminal' && activeTabId) {
        requestTerminalFocus(activeTabId);
      }
    });
  }, HotkeyActions.OPEN_COMMAND_CENTER);

  return null;
}
