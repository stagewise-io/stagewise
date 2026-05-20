import {
  ShortcutCombo,
  type ShortcutComboProps,
} from '@stagewise/stage-ui/components/shortcut-key';
import type { HotkeyActions } from '@shared/hotkeys';
import { HotkeyComboText } from './hotkey-combo-text';

export type HotkeyComboProps = Omit<ShortcutComboProps, 'value'> & {
  action: HotkeyActions;
};

export function HotkeyCombo({ action, ...props }: HotkeyComboProps) {
  return <ShortcutCombo {...props} value={HotkeyComboText({ action })} />;
}
