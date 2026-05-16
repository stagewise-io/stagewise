export type Platform = 'mac' | 'windows' | 'linux';

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
  NEW_CHAT = 'new_chat',
  DOWNLOADS = 'downloads',

  // Tab & window navigation (browser tabs only)
  NEW_TAB = 'new_tab',
  RESTORE_TAB = 'restore_tab',
  CLOSE_TAB = 'close_tab',
  CLOSE_WINDOW = 'close_window',
  NEXT_TAB = 'next_tab',
  PREV_TAB = 'prev_tab',

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
  HOME_PAGE = 'home_page',

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
    // Matches Codex / VS Code / GitHub Desktop convention.
    // Capture-dominant: the chat composer (TipTap) is configured as
    // plain-text only (no bold/italic/underline marks), so there is no
    // formatting shortcut to protect. Running in the capture phase makes
    // Cmd/Ctrl+B reliably toggle the sidebar even when the chat input
    // (a contentEditable element) is focused.
    accelerator: 'Mod+B',
    captureDominantly: true,
  },
  [HotkeyActions.NEW_CHAT]: {
    accelerator: 'Mod+N',
    captureDominantly: false, // Allows 'Down' navigation in lists on Windows/Linux
  },
  [HotkeyActions.DOWNLOADS]: {
    accelerator: 'Mod+J',
    captureDominantly: false,
  },

  // Tab & window navigation
  [HotkeyActions.NEW_TAB]: {
    accelerator: 'Mod+T',
    captureDominantly: true,
  },
  [HotkeyActions.RESTORE_TAB]: {
    accelerator: 'Mod+Shift+T',
    captureDominantly: true,
  },
  [HotkeyActions.CLOSE_TAB]: {
    accelerator: 'Mod+W',
    captureDominantly: true,
  },
  [HotkeyActions.CLOSE_WINDOW]: {
    accelerator: 'Mod+Shift+W',
    captureDominantly: true,
  },
  // Browser-tab navigation. Ctrl+Tab is intentionally NOT bound here —
  // those keys drive agent switching via NEXT_AGENT / PREV_AGENT.
  [HotkeyActions.NEXT_TAB]: {
    accelerator: 'Mod+PageDown',
    mac: 'Mod+Alt+ArrowRight',
    macAliases: ['Mod+PageDown'],
    captureDominantly: true,
  },
  [HotkeyActions.PREV_TAB]: {
    accelerator: 'Mod+PageUp',
    mac: 'Mod+Alt+ArrowLeft',
    macAliases: ['Mod+PageUp'],
    captureDominantly: true,
  },

  // Agent switching. Ctrl+Tab works on all platforms (explicit Ctrl, not
  // Mod) — Cmd+Tab on macOS is reserved by the OS app switcher and cannot
  // be intercepted reliably.
  [HotkeyActions.NEXT_AGENT]: {
    accelerator: 'Ctrl+Tab',
    captureDominantly: true,
  },
  [HotkeyActions.PREV_AGENT]: {
    accelerator: 'Ctrl+Shift+Tab',
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
  [HotkeyActions.HOME_PAGE]: {
    accelerator: 'Mod+Shift+H',
    captureDominantly: false,
  },

  // URL bar
  [HotkeyActions.FOCUS_URL_BAR]: {
    accelerator: 'Mod+L',
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
    accelerator: 'Ctrl+Shift+I', // Windows/Linux: Ctrl+Shift+I
    aliases: ['F12', 'Ctrl+Shift+J'],
    mac: 'Mod+Alt+I', // Mac: Cmd+Opt+I
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
 * Detects the current platform based on navigator.
 */
export function getCurrentPlatform(): Platform {
  if (typeof navigator !== 'undefined') {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) return 'mac';
    if (platform.includes('win')) return 'windows';
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
      return ev.code === 'Slash';

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
