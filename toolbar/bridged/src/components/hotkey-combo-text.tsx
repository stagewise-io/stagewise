import { hotkeyActionDefinitions, type HotkeyActions } from '../utils';
import useBrowserInfo from '../hooks/use-user-agent';

export function HotkeyComboText({ action }: { action: HotkeyActions }) {
  const userAgent = useBrowserInfo();

  return userAgent.os.name.toLowerCase().includes('mac')
    ? hotkeyActionDefinitions[action].keyComboMac
    : hotkeyActionDefinitions[action].keyComboDefault;
}
