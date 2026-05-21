/**
 * Converts a DOM KeyboardEvent code to an Electron Accelerator key code.
 * Maps DOM event.code values (like "KeyA", "Escape") to Electron keyCode format.
 */
export function domCodeToElectronKeyCode(code: string, key: string): string {
  // Special keys mapping
  const specialKeys: Record<string, string> = {
    // Function keys stay the same (F1-F24)
    Escape: 'Escape',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Enter: 'Enter',
    Space: 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    CapsLock: 'CapsLock',
    NumLock: 'NumLock',
    ScrollLock: 'ScrollLock',
    Pause: 'Pause',
    PrintScreen: 'PrintScreen',

    // Numpad
    NumpadEnter: 'Enter',
    NumpadAdd: 'Plus',
    NumpadSubtract: 'Minus',
    NumpadMultiply: '*',
    NumpadDivide: '/',
    NumpadDecimal: '.',
    Numpad0: '0',
    Numpad1: '1',
    Numpad2: '2',
    Numpad3: '3',
    Numpad4: '4',
    Numpad5: '5',
    Numpad6: '6',
    Numpad7: '7',
    Numpad8: '8',
    Numpad9: '9',

    // Media keys
    MediaPlayPause: 'MediaPlayPause',
    MediaStop: 'MediaStop',
    MediaNextTrack: 'MediaNextTrack',
    MediaPreviousTrack: 'MediaPreviousTrack',
    AudioVolumeUp: 'VolumeUp',
    AudioVolumeDown: 'VolumeDown',
    AudioVolumeMute: 'VolumeMute',
  };

  // Check if it's a special key
  if (specialKeys[code]) return specialKeys[code];

  // Hotkeys are defined against physical DOM codes (KeyA, Digit1, etc.).
  // With Alt/Option, `key` can become a layout-specific symbol (e.g.
  // Option+L => "¬", Option+B => "∫"), which would synthesize the wrong
  // KeyboardEvent code in the UI process. Prefer the physical code for
  // letter/digit keys so tunneled app shortcuts still match.
  if (code.startsWith('Key')) return code.substring(3);
  if (code.startsWith('Digit')) return code.substring(5);

  // For regular character keys that are not represented by a physical
  // letter/digit code, use the key property which gives us the actual
  // character.
  if (key.length === 1) return key;

  // For modifier keys, we don't need to send them as keyCode
  // since they're handled by the modifiers array
  if (
    code.startsWith('Meta') ||
    code.startsWith('Control') ||
    code.startsWith('Alt') ||
    code.startsWith('Shift')
  )
    return key;

  // Last resort: use the key as-is
  return key;
}
