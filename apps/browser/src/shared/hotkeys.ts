export interface HotkeyActionDefinition {
  keyComboDefault: string;
  keyComboMac: string;
  isEventMatching: (ev: KeyboardEvent) => boolean;
  captureDominantly?: boolean;
}

export enum HotkeyActions {
  ESC = 0,
  CTRL_ALT_PERIOD = 1,
  CMD_T = 2,
  CMD_L = 3,
}

export const hotkeyActionDefinitions: Record<
  HotkeyActions,
  HotkeyActionDefinition
> = {
  [HotkeyActions.ESC]: {
    keyComboDefault: 'Esc',
    keyComboMac: 'esc',
    isEventMatching: (ev) => ev.code === 'Escape',
  },
  [HotkeyActions.CTRL_ALT_PERIOD]: {
    keyComboDefault: 'Ctrl+Alt+.',
    keyComboMac: '⌘+⌥+.',
    isEventMatching: (ev) =>
      ev.code === 'Period' && (ev.ctrlKey || ev.metaKey) && ev.altKey,
  },
  [HotkeyActions.CMD_T]: {
    keyComboDefault: 'Ctrl+T',
    keyComboMac: '⌘+T',
    isEventMatching: (ev) => ev.code === 'KeyT' && (ev.ctrlKey || ev.metaKey),
    captureDominantly: true,
  },
  [HotkeyActions.CMD_L]: {
    keyComboDefault: 'Ctrl+L',
    keyComboMac: '⌘+L',
    isEventMatching: (ev) => ev.code === 'KeyL' && (ev.ctrlKey || ev.metaKey),
  },
};

export function getHotkeyDefinitionForEvent(
  ev: KeyboardEvent,
): HotkeyActionDefinition | undefined {
  return Object.values(hotkeyActionDefinitions).find((definition) =>
    definition.isEventMatching(ev),
  );
}
