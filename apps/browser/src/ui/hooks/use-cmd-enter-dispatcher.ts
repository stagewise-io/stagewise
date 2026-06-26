import { useCallback } from 'react';
import { useHotKeyListener } from './use-hotkey-listener';
import { HotkeyActions } from '@shared/hotkeys';
import { cmdEnterRegistry } from '@ui/utils/cmd-enter-registry';

/**
 * Single global CMD+Enter listener that dispatches to the registry's
 * current winner. Mount this once in ChatPanel — every CMD+Enter-eligible
 * component registers itself via `useCmdEnterTarget` and the registry
 * resolves which one wins based on priority + viewport visibility.
 */
export function useCmdEnterDispatcher() {
  useHotKeyListener(
    useCallback(() => {
      const winner = cmdEnterRegistry.getWinner();
      if (!winner) return false;
      winner.action();
    }, []),
    HotkeyActions.CMD_ENTER,
    true,
  );
}
