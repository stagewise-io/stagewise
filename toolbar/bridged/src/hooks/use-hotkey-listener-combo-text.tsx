import { hotkeyActionDefinitions, type HotkeyActions } from '../utils.js';
import useBrowserInfo from './use-user-agent.js';

export function useHotkeyListenerComboText(action: HotkeyActions) {
  const userAgent = useBrowserInfo();

  return userAgent.os.name.toLowerCase().includes('mac')
    ? hotkeyActionDefinitions[action].keyComboMac
    : hotkeyActionDefinitions[action].keyComboDefault;
}
