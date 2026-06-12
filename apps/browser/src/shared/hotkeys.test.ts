import { describe, it, expect } from 'vitest';
import {
  isEventMatch,
  getDisplayString,
  hotkeyDefinitions,
  HotkeyActions,
  type HotkeyDefinition,
} from './hotkeys';

// Helper to create a mock KeyboardEvent
function createKeyboardEvent(
  options: Partial<{
    code: string;
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  }>,
): KeyboardEvent {
  return {
    code: options.code ?? '',
    key: options.key ?? '',
    metaKey: options.metaKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    altKey: options.altKey ?? false,
    shiftKey: options.shiftKey ?? false,
  } as KeyboardEvent;
}

describe('isEventMatch', () => {
  describe('basic modifier matching', () => {
    it('matches Mod+T on Mac with metaKey+T', () => {
      const def: HotkeyDefinition = { accelerator: 'Mod+T' };
      const ev = createKeyboardEvent({ code: 'KeyT', metaKey: true });
      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });

    it('matches Mod+T on Windows with ctrlKey+T', () => {
      const def: HotkeyDefinition = { accelerator: 'Mod+T' };
      const ev = createKeyboardEvent({ code: 'KeyT', ctrlKey: true });
      expect(isEventMatch(ev, def, 'windows')).toBe(true);
    });

    it('matches Mod+T on Linux with ctrlKey+T', () => {
      const def: HotkeyDefinition = { accelerator: 'Mod+T' };
      const ev = createKeyboardEvent({ code: 'KeyT', ctrlKey: true });
      expect(isEventMatch(ev, def, 'linux')).toBe(true);
    });
  });

  describe('strict exclusivity', () => {
    it('does NOT match Mod+T when Shift is also pressed', () => {
      const def: HotkeyDefinition = { accelerator: 'Mod+T' };
      const ev = createKeyboardEvent({
        code: 'KeyT',
        metaKey: true,
        shiftKey: true,
      });
      expect(isEventMatch(ev, def, 'mac')).toBe(false);
    });

    it('does NOT match Mod+T when Alt is also pressed', () => {
      const def: HotkeyDefinition = { accelerator: 'Mod+T' };
      const ev = createKeyboardEvent({
        code: 'KeyT',
        metaKey: true,
        altKey: true,
      });
      expect(isEventMatch(ev, def, 'mac')).toBe(false);
    });

    it('matches Mod+Shift+T when both modifiers are pressed', () => {
      const def: HotkeyDefinition = { accelerator: 'Mod+Shift+T' };
      const ev = createKeyboardEvent({
        code: 'KeyT',
        metaKey: true,
        shiftKey: true,
      });
      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });
  });

  describe('platform-specific overrides', () => {
    const def: HotkeyDefinition = {
      accelerator: 'Alt+ArrowLeft',
      mac: 'Mod+ArrowLeft',
    };

    it('uses mac override on Mac platform', () => {
      const ev = createKeyboardEvent({ code: 'ArrowLeft', metaKey: true });
      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });

    it('uses accelerator on Windows platform', () => {
      const ev = createKeyboardEvent({ code: 'ArrowLeft', altKey: true });
      expect(isEventMatch(ev, def, 'windows')).toBe(true);
    });

    it('does NOT match mac override on Windows', () => {
      const ev = createKeyboardEvent({ code: 'ArrowLeft', ctrlKey: true });
      expect(isEventMatch(ev, def, 'windows')).toBe(false);
    });
  });

  describe('special key matching', () => {
    it('matches arrow keys', () => {
      const def: HotkeyDefinition = { accelerator: 'Alt+ArrowRight' };
      const ev = createKeyboardEvent({ code: 'ArrowRight', altKey: true });
      expect(isEventMatch(ev, def, 'windows')).toBe(true);
    });

    it('matches function keys', () => {
      const def: HotkeyDefinition = { accelerator: 'F5' };
      const ev = createKeyboardEvent({ code: 'F5' });
      expect(isEventMatch(ev, def, 'windows')).toBe(true);
    });

    it('matches F12', () => {
      const def: HotkeyDefinition = { accelerator: 'F12' };
      const ev = createKeyboardEvent({ code: 'F12' });
      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });

    it('matches Tab key with Ctrl', () => {
      const def: HotkeyDefinition = { accelerator: 'Ctrl+Tab' };
      const ev = createKeyboardEvent({ code: 'Tab', ctrlKey: true });
      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });

    it('matches Escape key', () => {
      const def: HotkeyDefinition = { accelerator: 'Escape' };
      const ev = createKeyboardEvent({ code: 'Escape' });
      expect(isEventMatch(ev, def, 'windows')).toBe(true);
    });
  });

  describe('alias matching', () => {
    it('matches primary accelerator', () => {
      const def: HotkeyDefinition = {
        accelerator: 'Mod+R',
        aliases: ['F5'],
      };
      const ev = createKeyboardEvent({ code: 'KeyR', ctrlKey: true });
      expect(isEventMatch(ev, def, 'windows')).toBe(true);
    });

    it('matches alias', () => {
      const def: HotkeyDefinition = {
        accelerator: 'Mod+R',
        aliases: ['F5'],
      };
      const ev = createKeyboardEvent({ code: 'F5' });
      expect(isEventMatch(ev, def, 'windows')).toBe(true);
    });

    it('matches macAliases on Mac only', () => {
      const def: HotkeyDefinition = {
        accelerator: 'Alt+ArrowLeft',
        mac: 'Mod+ArrowLeft',
        macAliases: ['Mod+BracketLeft'],
      };
      // Mac alias
      const ev = createKeyboardEvent({ code: 'BracketLeft', metaKey: true });
      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });
  });

  describe('digit keys', () => {
    it('matches Mod+1', () => {
      const def: HotkeyDefinition = { accelerator: 'Mod+1' };
      const ev = createKeyboardEvent({ code: 'Digit1', metaKey: true });
      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });

    it('matches Mod+0', () => {
      const def: HotkeyDefinition = { accelerator: 'Mod+0' };
      const ev = createKeyboardEvent({ code: 'Digit0', ctrlKey: true });
      expect(isEventMatch(ev, def, 'windows')).toBe(true);
    });
  });

  describe('terminal toggle shortcuts', () => {
    const def = hotkeyDefinitions[HotkeyActions.FOCUS_OR_TOGGLE_TERMINAL];

    it('matches Ctrl+Backquote on Mac', () => {
      const ev = createKeyboardEvent({ code: 'Backquote', ctrlKey: true });
      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });

    it('matches Cmd+J on Mac', () => {
      const ev = createKeyboardEvent({ code: 'KeyJ', metaKey: true });
      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });

    it('does NOT match Ctrl+J on Windows', () => {
      const ev = createKeyboardEvent({ code: 'KeyJ', ctrlKey: true });
      expect(isEventMatch(ev, def, 'windows')).toBe(false);
    });
  });

  describe('layout-dependent symbol keys', () => {
    it('uses Mod+Alt+Slash for cycling model thinking effort', () => {
      const def = hotkeyDefinitions[HotkeyActions.CYCLE_MODEL_THINKING_EFFORT];
      const ev = createKeyboardEvent({
        code: 'Slash',
        key: '÷',
        metaKey: true,
        altKey: true,
      });

      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });

    it('does NOT match physical Slash without Alt when it produces another character', () => {
      const def: HotkeyDefinition = { accelerator: 'Mod+Slash' };
      const ev = createKeyboardEvent({
        code: 'Slash',
        key: '-',
        metaKey: true,
      });

      expect(isEventMatch(ev, def, 'mac')).toBe(false);
    });

    it('keeps shifted Slash available for Open Model Select layouts', () => {
      const def = hotkeyDefinitions[HotkeyActions.OPEN_MODEL_SELECT];
      const ev = createKeyboardEvent({
        code: 'Digit7',
        key: '/',
        metaKey: true,
        shiftKey: true,
      });

      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });

    it('matches Slash by produced character', () => {
      const def: HotkeyDefinition = { accelerator: 'Mod+Slash' };
      const ev = createKeyboardEvent({
        code: 'Digit7',
        key: '/',
        metaKey: true,
      });
      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });

    it('matches physical Slash with Alt when it produces another character', () => {
      const def: HotkeyDefinition = { accelerator: 'Mod+Alt+Slash' };
      const ev = createKeyboardEvent({
        code: 'Slash',
        key: '÷',
        metaKey: true,
        altKey: true,
      });
      expect(isEventMatch(ev, def, 'mac')).toBe(true);
    });
  });
});

describe('getDisplayString', () => {
  it('returns Mac symbols for Mod+T on Mac', () => {
    const def: HotkeyDefinition = { accelerator: 'Mod+T' };
    expect(getDisplayString(def, 'mac')).toBe('⌘T');
  });

  it('returns text format for Mod+T on Windows', () => {
    const def: HotkeyDefinition = { accelerator: 'Mod+T' };
    expect(getDisplayString(def, 'windows')).toBe('Ctrl+T');
  });

  it('uses mac override for display on Mac', () => {
    const def: HotkeyDefinition = {
      accelerator: 'Mod+Shift+I',
      mac: 'Mod+Alt+I',
    };
    // Modifiers appear in accelerator string order (Alt before Cmd symbol)
    expect(getDisplayString(def, 'mac')).toBe('⌥⌘I');
  });

  it('returns Shift symbol on Mac', () => {
    const def: HotkeyDefinition = { accelerator: 'Mod+Shift+T' };
    // Modifiers appear in accelerator string order (Shift before Cmd symbol)
    expect(getDisplayString(def, 'mac')).toBe('⇧⌘T');
  });

  it('displays cycle model thinking effort as Cmd+Alt+Slash on Mac', () => {
    const def = hotkeyDefinitions[HotkeyActions.CYCLE_MODEL_THINKING_EFFORT];
    expect(getDisplayString(def, 'mac')).toBe('⌥⌘/');
  });

  it('returns Alt symbol on Mac', () => {
    const def: HotkeyDefinition = { accelerator: 'Alt+ArrowLeft' };
    expect(getDisplayString(def, 'mac')).toBe('⌥←');
  });

  it('returns arrow symbols', () => {
    const def: HotkeyDefinition = { accelerator: 'Alt+ArrowRight' };
    expect(getDisplayString(def, 'mac')).toBe('⌥→');
    expect(getDisplayString(def, 'windows')).toBe('Alt+→');
  });
});
