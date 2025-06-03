import { hotkeyActionDefinitions, type HotkeyActions } from '../utils';
import useBrowserInfo from './use-user-agent';

export function useHotkeyListenerComboText(action: HotkeyActions) {
  const userAgent = useBrowserInfo();

  return userAgent.os.name.toLowerCase().includes('mac')
    ? hotkeyActionDefinitions[action].keyComboMac
    : hotkeyActionDefinitions[action].keyComboDefault;
}
