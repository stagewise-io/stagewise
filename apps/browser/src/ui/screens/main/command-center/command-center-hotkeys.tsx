import { HotkeyActions } from '@shared/hotkeys';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { useCommandCenter } from './command-center-context';

export function CommandCenterHotkeys() {
  const { toggle } = useCommandCenter();

  useHotKeyListener(() => {
    toggle();
  }, HotkeyActions.OPEN_COMMAND_CENTER);

  return null;
}
