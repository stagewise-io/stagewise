export interface HotkeyActionDefinition {
  keyComboDefault: string;
  keyComboMac: string;
  isEventMatching: (ev: KeyboardEvent) => boolean;
  captureDominantly?: boolean;
}

export enum HotkeyActions {
  // stagewise specific
  CTRL_I = 'ctrl_i',

  // tab & window navigation
  CTRL_T = 'ctrl_t', // new tab
  CTRL_SHIFT_T = 'ctrl_shift_t', // re-open last closed tab
  CTRL_W = 'ctrl_w', // close active tab
  CTRL_SHIFT_W = 'ctrl_shift_w', // close window
  // switch to next tab
  CTRL_TAB = 'ctrl_tab',
  CTRL_PAGE_DOWN = 'ctrl_page_down',
  CMD_OPTION_ARROW_RIGHT = 'cmd_option_arrow_right', // switch to next tab (macOS)
  // switch to previous tab
  CTRL_PAGE_UP = 'ctrl_page_up',
  CTRL_SHIFT_TAB = 'ctrl_shift_tab',
  CMD_OPTION_ARROW_LEFT = 'cmd_option_arrow_left', // switch to previous tab (macOS)
  // focus tab 1 - 8
  CTRL_1 = 'ctrl_1',
  CTRL_2 = 'ctrl_2',
  CTRL_3 = 'ctrl_3',
  CTRL_4 = 'ctrl_4',
  CTRL_5 = 'ctrl_5',
  CTRL_6 = 'ctrl_6',
  CTRL_7 = 'ctrl_7',
  CTRL_8 = 'ctrl_8',
  CTRL_9 = 'ctrl_9', // focus last tab
  // Back in history (macOS)
  CMD_BRACKET_LEFT = 'cmd_bracket_left',
  CMD_ARROW_LEFT = 'cmd_arrow_left',
  ALT_ARROW_LEFT = 'alt_arrow_left', // Back in history (windows/ linux)
  // Forward in history (macOS)
  CMD_BRACKET_RIGHT = 'cmd_bracket_right',
  CMD_ARROW_RIGHT = 'cmd_arrow_right',
  ALT_ARROW_RIGHT = 'alt_arrow_right', // Forward in history (windows/ linux)
  CMD_SHIFT_H = 'cmd_shift_h', // Open home page in current tab

  CTRL_L = 'ctrl_l', // focus address bar
  ALT_D = 'alt_d',
  F6 = 'f6',

  // page navigation
  // reload page
  CTRL_R = 'ctrl_r',
  F5 = 'f5',
  CTRL_SHIFT_R = 'ctrl_shift_r', // hard reload page (ignore cache) (not yet implemented, skip)

  // search, etc. (all of these are not yet implemented, skip)
  // focus search bar
  CTRL_F = 'ctrl_f',
  F3 = 'f3',
  CTRL_G = 'ctrl_g', // next match
  CTRL_SHIFT_G = 'ctrl_shift_g', // previous match

  // dev tools
  F12 = 'f12',
  CTRL_SHIFT_J = 'ctrl_shift_j', // open dev tools (macOS)
  CMD_OPTION_I = 'cmd_option_i', // open dev tools (macOS)

  // zoom
  CTRL_PLUS = 'ctrl_plus', // zoom in
  CTRL_MINUS = 'ctrl_minus', // zoom out
  CTRL_0 = 'ctrl_0', // reset zoom
}

export const hotkeyActionDefinitions: Record<
  HotkeyActions,
  HotkeyActionDefinition
> = {
  // stagewise specific
  [HotkeyActions.CTRL_I]: {
    keyComboDefault: 'Ctrl+I',
    keyComboMac: '⌘I',
    isEventMatching: (ev) =>
      ev.code === 'KeyI' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },

  // tab & window navigation
  [HotkeyActions.CTRL_T]: {
    keyComboDefault: 'Ctrl+T',
    keyComboMac: '⌘T',
    isEventMatching: (ev) =>
      ev.code === 'KeyT' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_SHIFT_T]: {
    keyComboDefault: 'Ctrl+Shift+T',
    keyComboMac: '⇧⌘T',
    isEventMatching: (ev) =>
      ev.code === 'KeyT' &&
      (ev.ctrlKey || ev.metaKey) &&
      ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_W]: {
    keyComboDefault: 'Ctrl+W',
    keyComboMac: '⌘W',
    isEventMatching: (ev) =>
      ev.code === 'KeyW' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_SHIFT_W]: {
    keyComboDefault: 'Ctrl+Shift+W',
    keyComboMac: '⇧⌘W',
    isEventMatching: (ev) =>
      ev.code === 'KeyW' &&
      (ev.ctrlKey || ev.metaKey) &&
      ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_TAB]: {
    keyComboDefault: 'Ctrl+Tab',
    keyComboMac: '⌘Tab',
    isEventMatching: (ev) =>
      ev.code === 'Tab' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_PAGE_DOWN]: {
    keyComboDefault: 'Ctrl+PageDown',
    keyComboMac: '⌘PageDown',
    isEventMatching: (ev) =>
      ev.code === 'PageDown' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CMD_OPTION_ARROW_RIGHT]: {
    keyComboDefault: 'Ctrl+PageDown',
    keyComboMac: '⌥⌘→',
    isEventMatching: (ev) =>
      ev.code === 'ArrowRight' &&
      ev.metaKey &&
      ev.altKey &&
      !ev.shiftKey &&
      !ev.ctrlKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_PAGE_UP]: {
    keyComboDefault: 'Ctrl+PageUp',
    keyComboMac: '⌘PageUp',
    isEventMatching: (ev) =>
      ev.code === 'PageUp' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_SHIFT_TAB]: {
    keyComboDefault: 'Ctrl+Shift+Tab',
    keyComboMac: '⇧⌘Tab',
    isEventMatching: (ev) =>
      ev.code === 'Tab' &&
      (ev.ctrlKey || ev.metaKey) &&
      ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CMD_OPTION_ARROW_LEFT]: {
    keyComboDefault: 'Ctrl+PageUp',
    keyComboMac: '⌥⌘←',
    isEventMatching: (ev) =>
      ev.code === 'ArrowLeft' &&
      ev.metaKey &&
      ev.altKey &&
      !ev.shiftKey &&
      !ev.ctrlKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_1]: {
    keyComboDefault: 'Ctrl+1',
    keyComboMac: '⌘1',
    isEventMatching: (ev) =>
      ev.code === 'Digit1' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_2]: {
    keyComboDefault: 'Ctrl+2',
    keyComboMac: '⌘2',
    isEventMatching: (ev) =>
      ev.code === 'Digit2' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_3]: {
    keyComboDefault: 'Ctrl+3',
    keyComboMac: '⌘3',
    isEventMatching: (ev) =>
      ev.code === 'Digit3' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_4]: {
    keyComboDefault: 'Ctrl+4',
    keyComboMac: '⌘4',
    isEventMatching: (ev) =>
      ev.code === 'Digit4' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_5]: {
    keyComboDefault: 'Ctrl+5',
    keyComboMac: '⌘5',
    isEventMatching: (ev) =>
      ev.code === 'Digit5' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_6]: {
    keyComboDefault: 'Ctrl+6',
    keyComboMac: '⌘6',
    isEventMatching: (ev) =>
      ev.code === 'Digit6' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_7]: {
    keyComboDefault: 'Ctrl+7',
    keyComboMac: '⌘7',
    isEventMatching: (ev) =>
      ev.code === 'Digit7' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_8]: {
    keyComboDefault: 'Ctrl+8',
    keyComboMac: '⌘8',
    isEventMatching: (ev) =>
      ev.code === 'Digit8' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_9]: {
    keyComboDefault: 'Ctrl+9',
    keyComboMac: '⌘9',
    isEventMatching: (ev) =>
      ev.code === 'Digit9' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CMD_BRACKET_LEFT]: {
    keyComboDefault: 'Alt+←',
    keyComboMac: '⌘[',
    isEventMatching: (ev) =>
      (ev.code === 'BracketLeft' &&
        ev.metaKey &&
        !ev.shiftKey &&
        !ev.altKey &&
        !ev.ctrlKey) ||
      (ev.code === 'ArrowLeft' &&
        ev.altKey &&
        !ev.shiftKey &&
        !ev.metaKey &&
        !ev.ctrlKey),
    captureDominantly: true,
  },
  [HotkeyActions.CMD_ARROW_LEFT]: {
    keyComboDefault: 'Alt+←',
    keyComboMac: '⌘←',
    isEventMatching: (ev) =>
      ev.code === 'ArrowLeft' &&
      ((ev.metaKey && !ev.shiftKey && !ev.altKey && !ev.ctrlKey) ||
        (ev.altKey && !ev.shiftKey && !ev.metaKey && !ev.ctrlKey)),
    captureDominantly: true,
  },
  [HotkeyActions.ALT_ARROW_LEFT]: {
    keyComboDefault: 'Alt+←',
    keyComboMac: '⌥←',
    isEventMatching: (ev) =>
      ev.code === 'ArrowLeft' &&
      ev.altKey &&
      !ev.shiftKey &&
      !ev.metaKey &&
      !ev.ctrlKey,
    captureDominantly: true,
  },
  [HotkeyActions.CMD_BRACKET_RIGHT]: {
    keyComboDefault: 'Alt+→',
    keyComboMac: '⌘]',
    isEventMatching: (ev) =>
      (ev.code === 'BracketRight' &&
        ev.metaKey &&
        !ev.shiftKey &&
        !ev.altKey &&
        !ev.ctrlKey) ||
      (ev.code === 'ArrowRight' &&
        ev.altKey &&
        !ev.shiftKey &&
        !ev.metaKey &&
        !ev.ctrlKey),
    captureDominantly: true,
  },
  [HotkeyActions.CMD_ARROW_RIGHT]: {
    keyComboDefault: 'Alt+→',
    keyComboMac: '⌘→',
    isEventMatching: (ev) =>
      ev.code === 'ArrowRight' &&
      ((ev.metaKey && !ev.shiftKey && !ev.altKey && !ev.ctrlKey) ||
        (ev.altKey && !ev.shiftKey && !ev.metaKey && !ev.ctrlKey)),
    captureDominantly: true,
  },
  [HotkeyActions.ALT_ARROW_RIGHT]: {
    keyComboDefault: 'Alt+→',
    keyComboMac: '⌥→',
    isEventMatching: (ev) =>
      ev.code === 'ArrowRight' &&
      ev.altKey &&
      !ev.shiftKey &&
      !ev.metaKey &&
      !ev.ctrlKey,
    captureDominantly: true,
  },
  [HotkeyActions.CMD_SHIFT_H]: {
    keyComboDefault: 'Ctrl+Shift+H',
    keyComboMac: '⇧⌘H',
    isEventMatching: (ev) =>
      ev.code === 'KeyH' &&
      (ev.ctrlKey || ev.metaKey) &&
      ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_L]: {
    keyComboDefault: 'Ctrl+L',
    keyComboMac: '⌘L',
    isEventMatching: (ev) =>
      ev.code === 'KeyL' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.ALT_D]: {
    keyComboDefault: 'Alt+D',
    keyComboMac: '⌥D',
    isEventMatching: (ev) =>
      ev.code === 'KeyD' &&
      ev.altKey &&
      !ev.shiftKey &&
      !ev.metaKey &&
      !ev.ctrlKey,
    captureDominantly: true,
  },
  [HotkeyActions.F6]: {
    keyComboDefault: 'F6',
    keyComboMac: 'F6',
    isEventMatching: (ev) =>
      ev.code === 'F6' &&
      !ev.shiftKey &&
      !ev.altKey &&
      !ev.metaKey &&
      !ev.ctrlKey,
    captureDominantly: true,
  },

  // page navigation
  [HotkeyActions.CTRL_R]: {
    keyComboDefault: 'Ctrl+R',
    keyComboMac: '⌘R',
    isEventMatching: (ev) =>
      ev.code === 'KeyR' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.F5]: {
    keyComboDefault: 'F5',
    keyComboMac: 'F5',
    isEventMatching: (ev) =>
      ev.code === 'F5' &&
      !ev.shiftKey &&
      !ev.altKey &&
      !ev.metaKey &&
      !ev.ctrlKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_SHIFT_R]: {
    keyComboDefault: 'Ctrl+Shift+R',
    keyComboMac: '⇧⌘R',
    isEventMatching: (ev) =>
      ev.code === 'KeyR' &&
      (ev.ctrlKey || ev.metaKey) &&
      ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },

  // search, etc.
  [HotkeyActions.CTRL_F]: {
    keyComboDefault: 'Ctrl+F',
    keyComboMac: '⌘F',
    isEventMatching: (ev) =>
      ev.code === 'KeyF' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.F3]: {
    keyComboDefault: 'F3',
    keyComboMac: 'F3',
    isEventMatching: (ev) =>
      ev.code === 'F3' &&
      !ev.shiftKey &&
      !ev.altKey &&
      !ev.metaKey &&
      !ev.ctrlKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_G]: {
    keyComboDefault: 'Ctrl+G',
    keyComboMac: '⌘G',
    isEventMatching: (ev) =>
      ev.code === 'KeyG' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_SHIFT_G]: {
    keyComboDefault: 'Ctrl+Shift+G',
    keyComboMac: '⇧⌘G',
    isEventMatching: (ev) =>
      ev.code === 'KeyG' &&
      (ev.ctrlKey || ev.metaKey) &&
      ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },

  // dev tools
  [HotkeyActions.F12]: {
    keyComboDefault: 'F12',
    keyComboMac: 'F12',
    isEventMatching: (ev) =>
      ev.code === 'F12' &&
      !ev.shiftKey &&
      !ev.altKey &&
      !ev.metaKey &&
      !ev.ctrlKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_SHIFT_J]: {
    keyComboDefault: 'Ctrl+Shift+J',
    keyComboMac: '⇧⌘J',
    isEventMatching: (ev) =>
      ev.code === 'KeyJ' &&
      (ev.ctrlKey || ev.metaKey) &&
      ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CMD_OPTION_I]: {
    keyComboDefault: 'Ctrl+Shift+I',
    keyComboMac: '⌥⌘I',
    isEventMatching: (ev) =>
      ev.code === 'KeyI' &&
      ev.metaKey &&
      ev.altKey &&
      !ev.shiftKey &&
      !ev.ctrlKey,
    captureDominantly: true,
  },

  // zoom
  [HotkeyActions.CTRL_PLUS]: {
    keyComboDefault: 'Ctrl++',
    keyComboMac: '⌘+',
    isEventMatching: (ev) =>
      ev.code === 'Equal' &&
      (ev.ctrlKey || ev.metaKey) &&
      ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_MINUS]: {
    keyComboDefault: 'Ctrl+-',
    keyComboMac: '⌘-',
    isEventMatching: (ev) =>
      (ev.code === 'Minus' ||
        ev.code === 'NumpadSubtract' ||
        ev.key === '-' ||
        ev.key === '_') &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.altKey,
    captureDominantly: true,
  },
  [HotkeyActions.CTRL_0]: {
    keyComboDefault: 'Ctrl+0',
    keyComboMac: '⌘0',
    isEventMatching: (ev) =>
      ev.code === 'Digit0' &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey &&
      !ev.altKey,
    captureDominantly: true,
  },
};

export function getHotkeyDefinitionForEvent(
  ev: KeyboardEvent,
): HotkeyActionDefinition | undefined {
  return Object.values(hotkeyActionDefinitions).find((definition) =>
    definition.isEventMatching(ev),
  );
}
