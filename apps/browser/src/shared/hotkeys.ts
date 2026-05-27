export type Platform = 'mac' | 'windows' | 'linux';

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

function platformFromString(value: string | undefined): Platform | null {
  const normalized = value?.toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('mac')) return 'mac';
  if (normalized.includes('win')) return 'windows';
  return null;
}

declare const process:
  | {
      platform?: string;
    }
  | undefined;

/**
 * Declarative hotkey definition using accelerator syntax.
 * Follows industry standards (Electron, VS Code, Chrome).
 */
export interface HotkeyDefinition {
  /** Cross-platform accelerator string (e.g., "Mod+T", "Mod+Shift+F") */
  accelerator: string;
  /** Optional Mac-specific override (e.g., "Mod+Alt+I" for DevTools) */
  mac?: string;
  /** Additional accelerators that trigger the same action (e.g., ["F5"] for reload) */
  aliases?: string[];
  /** Mac-specific aliases */
  macAliases?: string[];
  /** If true, captures in capture phase to override web content handlers */
  captureDominantly?: boolean;
}

/**
 * Semantic hotkey action identifiers.
 * Names describe the action, not the key combination.
 */
export enum HotkeyActions {
  // Stagewise specific
  TOGGLE_CONTEXT_SELECTOR = 'toggle_context_selector',
  TOGGLE_SIDEBAR = 'toggle_sidebar',
  FOCUS_CHAT_INPUT = 'focus_chat_input',
  OPEN_SETTINGS = 'open_settings',
  EDIT_NEAREST_USER_MESSAGE = 'edit_nearest_user_message',
  OPEN_WORKSPACE_SELECT = 'open_workspace_select',
  OPEN_MODEL_SELECT = 'open_model_select',
  OPEN_COMMAND_CENTER = 'open_command_center',
  COMMAND_CENTER_RENAME_AGENT = 'command_center_rename_agent',
  COMMAND_CENTER_TOGGLE_AGENT_PIN = 'command_center_toggle_agent_pin',
  COMMAND_CENTER_COPY_TAB_URL = 'command_center_copy_tab_url',
  COMMAND_CENTER_DELETE_AGENT = 'command_center_delete_agent',
  NEW_CHAT = 'new_chat',
  IMPLEMENT_CREATED_PLAN = 'implement_created_plan',
  STOP_AGENT = 'stop_agent',

  // Tab & window navigation
  NEW_TAB = 'new_tab',
  NEW_TERMINAL_TAB = 'new_terminal_tab',
  CLOSE_TAB = 'close_tab',
  NEXT_TAB = 'next_tab',
  PREV_TAB = 'prev_tab',

  // Content panel tab switching (per-agent, Mod+Alt based)
  FOCUS_TAB_1 = 'focus_tab_1',
  FOCUS_TAB_2 = 'focus_tab_2',
  FOCUS_TAB_3 = 'focus_tab_3',
  FOCUS_TAB_4 = 'focus_tab_4',
  FOCUS_TAB_5 = 'focus_tab_5',
  FOCUS_TAB_6 = 'focus_tab_6',
  FOCUS_TAB_7 = 'focus_tab_7',
  FOCUS_TAB_8 = 'focus_tab_8',
  FOCUS_TAB_9 = 'focus_tab_9',
  TOGGLE_CONTENT_PANEL = 'toggle_content_panel',

  // Agent switching (sidebar agents — independent of browser tabs)
  NEXT_AGENT = 'next_agent',
  PREV_AGENT = 'prev_agent',
  FOCUS_AGENT_1 = 'focus_agent_1',
  FOCUS_AGENT_2 = 'focus_agent_2',
  FOCUS_AGENT_3 = 'focus_agent_3',
  FOCUS_AGENT_4 = 'focus_agent_4',
  FOCUS_AGENT_5 = 'focus_agent_5',
  FOCUS_AGENT_6 = 'focus_agent_6',
  FOCUS_AGENT_7 = 'focus_agent_7',
  FOCUS_AGENT_8 = 'focus_agent_8',
  FOCUS_AGENT_LAST = 'focus_agent_last',

  // History navigation
  HISTORY_BACK = 'history_back',
  HISTORY_FORWARD = 'history_forward',

  // URL bar
  FOCUS_URL_BAR = 'focus_url_bar',

  // Page navigation
  RELOAD = 'reload',
  HARD_RELOAD = 'hard_reload',

  // Search
  FIND_IN_PAGE = 'find_in_page',
  FIND_NEXT = 'find_next',
  FIND_PREV = 'find_prev',

  // Dev tools
  DEV_TOOLS = 'dev_tools',

  // Zoom
  ZOOM_IN = 'zoom_in',
  ZOOM_OUT = 'zoom_out',
  ZOOM_RESET = 'zoom_reset',
}

/**
 * Hotkey definitions using declarative accelerator syntax.
 * Mod = Cmd on Mac, Ctrl on Windows/Linux
 * Alt/Option = Alt key on all platforms
 * Ctrl = Explicit Ctrl key (for Ctrl+Tab which uses actual Ctrl on all platforms)
 */
export const hotkeyDefinitions: Record<HotkeyActions, HotkeyDefinition> = {
  // Stagewise specific
  [HotkeyActions.TOGGLE_CONTEXT_SELECTOR]: {
    accelerator: 'Mod+I',
    captureDominantly: true,
  },
  [HotkeyActions.TOGGLE_SIDEBAR]: {
    accelerator: 'Mod+B',
    captureDominantly: true,
  },
  // Focus the chat input. One-way focus command; does not toggle away.
  [HotkeyActions.FOCUS_CHAT_INPUT]: {
    accelerator: 'Mod+L',
    captureDominantly: true,
  },
  [HotkeyActions.OPEN_SETTINGS]: {
    accelerator: 'Mod+Comma',
    captureDominantly: true,
  },
  [HotkeyActions.EDIT_NEAREST_USER_MESSAGE]: {
    accelerator: 'Ctrl+Shift+E',
    mac: 'Mod+Shift+I',
    captureDominantly: true,
  },
  [HotkeyActions.OPEN_WORKSPACE_SELECT]: {
    accelerator: 'Mod+O',
    captureDominantly: true,
  },
  [HotkeyActions.OPEN_MODEL_SELECT]: {
    accelerator: 'Mod+Slash',
    aliases: ['Mod+Shift+Slash'],
    captureDominantly: true,
  },
  [HotkeyActions.OPEN_COMMAND_CENTER]: {
    accelerator: 'Mod+K',
    captureDominantly: false,
  },
  [HotkeyActions.COMMAND_CENTER_RENAME_AGENT]: {
    accelerator: 'Mod+E',
    captureDominantly: false,
  },
  [HotkeyActions.COMMAND_CENTER_TOGGLE_AGENT_PIN]: {
    accelerator: 'Ctrl+Shift+P',
    mac: 'Mod+P',
    captureDominantly: false,
  },
  [HotkeyActions.COMMAND_CENTER_COPY_TAB_URL]: {
    accelerator: 'Mod+C',
    captureDominantly: false,
  },
  [HotkeyActions.COMMAND_CENTER_DELETE_AGENT]: {
    accelerator: 'Ctrl+Shift+D',
    mac: 'Mod+D',
    captureDominantly: false,
  },
  [HotkeyActions.NEW_CHAT]: {
    accelerator: 'Mod+N',
    captureDominantly: false,
  },
  [HotkeyActions.IMPLEMENT_CREATED_PLAN]: {
    accelerator: 'Mod+Enter',
    captureDominantly: true,
  },
  [HotkeyActions.STOP_AGENT]: {
    accelerator: 'Ctrl+C',
    captureDominantly: false,
  },

  // Tab & window navigation
  [HotkeyActions.NEW_TAB]: {
    accelerator: 'Mod+T',
    captureDominantly: true,
  },
  [HotkeyActions.NEW_TERMINAL_TAB]: {
    accelerator: 'Mod+Alt+T',
    captureDominantly: true,
  },
  [HotkeyActions.CLOSE_TAB]: {
    accelerator: 'Mod+W',
    captureDominantly: true,
  },
  // Content-panel tab navigation (per-agent, Mod+Alt prefixes).
  [HotkeyActions.NEXT_TAB]: {
    accelerator: 'Mod+Alt+PageDown',
    captureDominantly: true,
  },
  [HotkeyActions.PREV_TAB]: {
    accelerator: 'Mod+Alt+PageUp',
    captureDominantly: true,
  },

  // Agent switching. Ctrl+Tab works on all platforms (explicit Ctrl, not
  // Mod) — Cmd+Tab on macOS is reserved by the OS app switcher and cannot
  // be intercepted reliably.
  [HotkeyActions.NEXT_AGENT]: {
    accelerator: 'Ctrl+Tab',
    aliases: ['Mod+PageDown'],
    captureDominantly: true,
  },
  [HotkeyActions.PREV_AGENT]: {
    accelerator: 'Ctrl+Shift+Tab',
    aliases: ['Mod+PageUp'],
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_AGENT_1]: {
    accelerator: 'Mod+1',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_AGENT_2]: {
    accelerator: 'Mod+2',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_AGENT_3]: {
    accelerator: 'Mod+3',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_AGENT_4]: {
    accelerator: 'Mod+4',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_AGENT_5]: {
    accelerator: 'Mod+5',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_AGENT_6]: {
    accelerator: 'Mod+6',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_AGENT_7]: {
    accelerator: 'Mod+7',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_AGENT_8]: {
    accelerator: 'Mod+8',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_AGENT_LAST]: {
    accelerator: 'Mod+9',
    captureDominantly: true,
  },

  // Agent-scoped tab switching (Mod+Alt+1-9).
  [HotkeyActions.FOCUS_TAB_1]: {
    accelerator: 'Mod+Alt+1',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_TAB_2]: {
    accelerator: 'Mod+Alt+2',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_TAB_3]: {
    accelerator: 'Mod+Alt+3',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_TAB_4]: {
    accelerator: 'Mod+Alt+4',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_TAB_5]: {
    accelerator: 'Mod+Alt+5',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_TAB_6]: {
    accelerator: 'Mod+Alt+6',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_TAB_7]: {
    accelerator: 'Mod+Alt+7',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_TAB_8]: {
    accelerator: 'Mod+Alt+8',
    captureDominantly: true,
  },
  [HotkeyActions.FOCUS_TAB_9]: {
    accelerator: 'Mod+Alt+9',
    captureDominantly: true,
  },
  [HotkeyActions.TOGGLE_CONTENT_PANEL]: {
    accelerator: 'Mod+Alt+B',
    captureDominantly: true,
  },

  // History navigation
  [HotkeyActions.HISTORY_BACK]: {
    accelerator: 'Alt+ArrowLeft',
    mac: 'Mod+ArrowLeft',
    macAliases: ['Mod+BracketLeft'],
    captureDominantly: false,
  },
  [HotkeyActions.HISTORY_FORWARD]: {
    accelerator: 'Alt+ArrowRight',
    mac: 'Mod+ArrowRight',
    macAliases: ['Mod+BracketRight'],
    captureDominantly: false,
  },

  // URL bar
  [HotkeyActions.FOCUS_URL_BAR]: {
    accelerator: 'Mod+Alt+L',
    aliases: ['Alt+D', 'F6'],
    captureDominantly: true,
  },

  // Page navigation
  [HotkeyActions.RELOAD]: {
    accelerator: 'Mod+R',
    aliases: ['F5'],
    captureDominantly: false, // Allow apps to handle soft reload
  },
  [HotkeyActions.HARD_RELOAD]: {
    accelerator: 'Mod+Shift+R',
    captureDominantly: true,
  },

  // Search
  [HotkeyActions.FIND_IN_PAGE]: {
    accelerator: 'Mod+F',
    aliases: ['F3'],
    captureDominantly: false, // Allow apps to use their own find
  },
  [HotkeyActions.FIND_NEXT]: {
    accelerator: 'Mod+G',
    captureDominantly: false,
  },
  [HotkeyActions.FIND_PREV]: {
    accelerator: 'Mod+Shift+G',
    captureDominantly: false,
  },

  // Dev tools
  [HotkeyActions.DEV_TOOLS]: {
    accelerator: 'Ctrl+Shift+I',
    aliases: ['F12', 'Ctrl+Shift+J'],
    mac: 'Mod+Alt+I',
    macAliases: ['F12'],
    captureDominantly: true,
  },

  // Zoom — match both Cmd+= and Cmd+Shift+= (US: Plus key).
  // Primary: Mod+Equal (Cmd+=), alias: Mod+Shift+Equal (Cmd++).
  // Key matching uses both ev.code (US layout) and ev.key (QWERTZ/AZERTY).
  [HotkeyActions.ZOOM_IN]: {
    accelerator: 'Mod+Equal',
    aliases: ['Mod+Shift+Equal'],
    captureDominantly: true,
  },
  [HotkeyActions.ZOOM_OUT]: {
    accelerator: 'Mod+Minus',
    captureDominantly: true,
  },
  [HotkeyActions.ZOOM_RESET]: {
    accelerator: 'Mod+0',
    captureDominantly: true,
  },
};

/**
 * Detects the current platform based on browser or Electron runtime data.
 */
export function getCurrentPlatform(): Platform {
  if (typeof navigator !== 'undefined') {
    const nav = navigator as NavigatorWithUserAgentData;
    const userAgentDataPlatform = platformFromString(
      nav.userAgentData?.platform,
    );
    if (userAgentDataPlatform) return userAgentDataPlatform;

    const userAgentPlatform = platformFromString(navigator.userAgent);
    if (userAgentPlatform) return userAgentPlatform;
  }

  if (typeof process !== 'undefined') {
    if (process.platform === 'darwin') return 'mac';
    if (process.platform === 'win32') return 'windows';
  }

  return 'linux';
}

/** Modifier tokens that can appear in accelerator strings */
const MODIFIER_TOKENS = new Set([
  'MOD',
  'CMDORCTRL',
  'SHIFT',
  'ALT',
  'OPTION',
  'CTRL',
  'CONTROL',
  'META',
  'CMD',
  'COMMAND',
]);

interface ParsedAccelerator {
  needsMod: boolean;
  needsShift: boolean;
  needsAlt: boolean;
  needsCtrl: boolean; // Explicit Ctrl (not Mod)
  needsMeta: boolean; // Explicit Meta (not Mod)
  keyToken: string;
}

/**
 * Parses an accelerator string into its component parts.
 * @param accelerator - e.g., "Mod+Shift+T", "Ctrl+Tab", "F12"
 */
function parseAccelerator(accelerator: string): ParsedAccelerator {
  const tokens = accelerator.toUpperCase().split('+');

  const needsMod = tokens.includes('MOD') || tokens.includes('CMDORCTRL');
  const needsShift = tokens.includes('SHIFT');
  const needsAlt = tokens.includes('ALT') || tokens.includes('OPTION');
  const needsCtrl = tokens.includes('CTRL') || tokens.includes('CONTROL');
  const needsMeta =
    tokens.includes('META') ||
    tokens.includes('CMD') ||
    tokens.includes('COMMAND');

  // Find the key token (the one that's not a modifier)
  const keyToken = tokens.find((t) => !MODIFIER_TOKENS.has(t)) || '';

  return { needsMod, needsShift, needsAlt, needsCtrl, needsMeta, keyToken };
}

/**
 * Matches the key part of an accelerator against a KeyboardEvent.
 * Handles letters, digits, function keys, arrows, and special keys.
 */
function matchKeyToken(ev: KeyboardEvent, token: string): boolean {
  // Handle single letters (A-Z)
  if (token.length === 1 && /^[A-Z]$/.test(token))
    return ev.code === `Key${token}`;

  // Handle single digits (0-9)
  if (token.length === 1 && /^[0-9]$/.test(token))
    return ev.code === `Digit${token}`;

  // Handle special keys
  switch (token) {
    // Arrow keys
    case 'ARROWUP':
      return ev.code === 'ArrowUp';
    case 'ARROWDOWN':
      return ev.code === 'ArrowDown';
    case 'ARROWLEFT':
      return ev.code === 'ArrowLeft';
    case 'ARROWRIGHT':
      return ev.code === 'ArrowRight';

    // Navigation keys
    case 'PAGEUP':
      return ev.code === 'PageUp';
    case 'PAGEDOWN':
      return ev.code === 'PageDown';
    case 'HOME':
      return ev.code === 'Home';
    case 'END':
      return ev.code === 'End';

    // Editing keys
    case 'ENTER':
    case 'RETURN':
      return ev.code === 'Enter';
    case 'TAB':
      return ev.code === 'Tab';
    case 'SPACE':
      return ev.code === 'Space';
    case 'BACKSPACE':
      return ev.code === 'Backspace';
    case 'DELETE':
      return ev.code === 'Delete';
    case 'ESCAPE':
    case 'ESC':
      return ev.code === 'Escape';

    // Punctuation/symbols
    case 'EQUAL':
    case 'PLUS':
      // Match by physical key code AND by character so both US and
      // non-US layouts (QWERTZ, AZERTY, etc.) work correctly.
      return ev.code === 'Equal' || ev.code === 'NumpadAdd' || ev.key === '+';
    case 'MINUS':
      return (
        ev.code === 'Minus' ||
        ev.code === 'NumpadSubtract' ||
        ev.key === '-' ||
        ev.key === '_'
      );
    case 'BRACKETLEFT':
      return ev.code === 'BracketLeft';
    case 'BRACKETRIGHT':
      return ev.code === 'BracketRight';
    case 'SEMICOLON':
      return ev.code === 'Semicolon';
    case 'QUOTE':
      return ev.code === 'Quote';
    case 'BACKQUOTE':
      return ev.code === 'Backquote';
    case 'BACKSLASH':
      return ev.code === 'Backslash';
    case 'COMMA':
      return ev.code === 'Comma';
    case 'PERIOD':
      return ev.code === 'Period';
    case 'SLASH':
      return ev.key === '/' || ev.code === 'NumpadDivide';

    // Function keys (F1-F24)
    default:
      if (/^F\d+$/.test(token)) {
        return ev.code === token;
      }
      return false;
  }
}

/**
 * Checks if a keyboard event matches a single accelerator string.
 * Performs STRICT matching - all modifiers must match exactly.
 */
function matchAccelerator(
  ev: KeyboardEvent,
  accelerator: string,
  platform: Platform,
): boolean {
  const parsed = parseAccelerator(accelerator);

  // Resolve Mod to the appropriate modifier for this platform
  // Mod = Meta (Cmd) on Mac, Ctrl on Windows/Linux
  const requiredMeta =
    platform === 'mac' ? parsed.needsMod || parsed.needsMeta : parsed.needsMeta;
  const requiredCtrl =
    platform === 'mac' ? parsed.needsCtrl : parsed.needsMod || parsed.needsCtrl;
  const requiredAlt = parsed.needsAlt;
  const requiredShift = parsed.needsShift;

  // STRICT modifier matching - must match exactly
  if (ev.metaKey !== requiredMeta) return false;
  if (ev.ctrlKey !== requiredCtrl) return false;
  if (ev.altKey !== requiredAlt) return false;
  if (ev.shiftKey !== requiredShift) return false;

  // Match the key
  if (!parsed.keyToken) return false;
  return matchKeyToken(ev, parsed.keyToken);
}

/**
 * Main event matcher - checks if an event matches a hotkey definition.
 * Handles platform-specific accelerators and aliases.
 */
export function isEventMatch(
  ev: KeyboardEvent,
  def: HotkeyDefinition,
  platform: Platform,
): boolean {
  // Determine which accelerator(s) to check based on platform
  const isMac = platform === 'mac';

  // Primary accelerator (use mac override if on Mac and available)
  const primaryAccelerator = isMac && def.mac ? def.mac : def.accelerator;

  // Check primary accelerator
  if (matchAccelerator(ev, primaryAccelerator, platform)) {
    return true;
  }

  // Check aliases
  const aliases = isMac ? def.macAliases || def.aliases : def.aliases;
  if (aliases) {
    for (const alias of aliases) {
      if (matchAccelerator(ev, alias, platform)) {
        return true;
      }
    }
  }

  return false;
}

/** Key display names for special keys */
const KEY_DISPLAY_NAMES: Record<string, { mac: string; default: string }> = {
  ARROWUP: { mac: '↑', default: '↑' },
  ARROWDOWN: { mac: '↓', default: '↓' },
  ARROWLEFT: { mac: '←', default: '←' },
  ARROWRIGHT: { mac: '→', default: '→' },
  PAGEUP: { mac: 'PageUp', default: 'PageUp' },
  PAGEDOWN: { mac: 'PageDown', default: 'PageDown' },
  ENTER: { mac: '↵', default: 'Enter' },
  RETURN: { mac: '↵', default: 'Enter' },
  TAB: { mac: '⇥', default: 'Tab' },
  SPACE: { mac: 'Space', default: 'Space' },
  BACKSPACE: { mac: '⌫', default: 'Backspace' },
  DELETE: { mac: '⌦', default: 'Delete' },
  ESCAPE: { mac: '⎋', default: 'Esc' },
  ESC: { mac: '⎋', default: 'Esc' },
  EQUAL: { mac: '+', default: '+' },
  PLUS: { mac: '+', default: '+' },
  MINUS: { mac: '-', default: '-' },
  BRACKETLEFT: { mac: '[', default: '[' },
  BRACKETRIGHT: { mac: ']', default: ']' },
  SEMICOLON: { mac: ';', default: ';' },
  QUOTE: { mac: "'", default: "'" },
  BACKQUOTE: { mac: '`', default: '`' },
  BACKSLASH: { mac: '\\', default: '\\' },
  COMMA: { mac: ',', default: ',' },
  PERIOD: { mac: '.', default: '.' },
  SLASH: { mac: '/', default: '/' },
};

/**
 * Generates a platform-specific display string from an accelerator.
 * Mac: Uses symbols (⌘⇧T)
 * Windows/Linux: Uses text (Ctrl+Shift+T)
 */
export function getDisplayString(
  def: HotkeyDefinition,
  platform: Platform,
): string {
  const isMac = platform === 'mac';

  // Use mac override if on Mac and available
  const accelerator = isMac && def.mac ? def.mac : def.accelerator;
  const tokens = accelerator.toUpperCase().split('+');

  if (isMac) {
    // Mac: Use symbols, no separators
    const parts: string[] = [];

    // Add modifiers in standard Mac order: ⌃⌥⇧⌘
    if (tokens.includes('CTRL') || tokens.includes('CONTROL')) parts.push('⌃');

    if (tokens.includes('ALT') || tokens.includes('OPTION')) parts.push('⌥');

    if (tokens.includes('SHIFT')) parts.push('⇧');

    if (
      tokens.includes('MOD') ||
      tokens.includes('CMDORCTRL') ||
      tokens.includes('CMD') ||
      tokens.includes('COMMAND') ||
      tokens.includes('META')
    )
      parts.push('⌘');

    // Add key
    const keyToken = tokens.find((t) => !MODIFIER_TOKENS.has(t));
    if (keyToken) {
      const displayName = KEY_DISPLAY_NAMES[keyToken];
      if (displayName) parts.push(displayName.mac);
      else if (keyToken.length === 1) parts.push(keyToken);
      else parts.push(keyToken);
    }

    return parts.join('');
  }

  // Windows/Linux: Use text with + separators
  const parts: string[] = [];

  // Add modifiers
  if (
    tokens.includes('MOD') ||
    tokens.includes('CMDORCTRL') ||
    tokens.includes('CTRL') ||
    tokens.includes('CONTROL')
  )
    parts.push('Ctrl');

  if (tokens.includes('ALT') || tokens.includes('OPTION')) parts.push('Alt');

  if (tokens.includes('SHIFT')) parts.push('Shift');

  if (
    tokens.includes('META') ||
    tokens.includes('CMD') ||
    tokens.includes('COMMAND')
  )
    parts.push('Win');

  // Add key
  const keyToken = tokens.find((t) => !MODIFIER_TOKENS.has(t));
  if (keyToken) {
    const displayName = KEY_DISPLAY_NAMES[keyToken];
    if (displayName) parts.push(displayName.default);
    else if (keyToken.length === 1) parts.push(keyToken);
    // Capitalize first letter for function keys, etc.
    else parts.push(keyToken.charAt(0) + keyToken.slice(1).toLowerCase());
  }

  return parts.join('+');
}

/**
 * Finds the hotkey definition that matches a keyboard event.
 * @deprecated Use isEventMatch() directly for better type safety
 */
export function getHotkeyDefinitionForEvent(
  ev: KeyboardEvent,
  platform: Platform = getCurrentPlatform(),
): (HotkeyDefinition & { action: HotkeyActions }) | undefined {
  for (const [action, def] of Object.entries(hotkeyDefinitions))
    if (isEventMatch(ev, def, platform))
      return { ...def, action: action as HotkeyActions };

  return undefined;
}

// Legacy type alias for backward compatibility
export type HotkeyActionDefinition = HotkeyDefinition & {
  action: HotkeyActions;
};

// Legacy export for backward compatibility
export const hotkeyActionDefinitions = hotkeyDefinitions;
