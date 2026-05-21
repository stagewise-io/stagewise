import { HotkeyActions } from '@shared/hotkeys';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import { useCommandCenter } from './command-center-context';

export function CommandCenterHotkeys() {
  const { close, isOpen, open, restoreFocusOnClose } = useCommandCenter();
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const { tabUiState } = useTabUIState();
  const shouldRestoreFocusOnClose = activeTabId
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
    void togglePanelKeyboardFocus('tab-content');
  }, HotkeyActions.OPEN_COMMAND_CENTER);

  return null;
}
