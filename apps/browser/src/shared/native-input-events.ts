/**
 * Utility to detect whether a keyboard event should be consumed by native
 * input elements rather than being handled by application hotkeys.
 *
 * This is used in both:
 * - web-content-preload: to let webcontents handle native input events
 * - UI hotkey listeners: to let native UI inputs handle events
 */

/**
 * Check if a keyboard event should be consumed by a native editable element.
 * This prevents hotkeys from interfering with standard text editing behavior
 * (e.g., Cmd+ArrowLeft to move cursor to start of line in an input).
 *
 * @returns true if the native element should handle the event, false if hotkeys can handle it
 */
export function shouldNativeInputConsumeEvent(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement;
  const tagName = target.tagName;

  // --- 1. Text Editing ---
  const isEditable =
    tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;

  if (isEditable) {
    // Exception: Input types that aren't really text inputs
    const type = (target as HTMLInputElement).type;
    if (
      type !== 'radio' &&
      type !== 'checkbox' &&
      type !== 'range' &&
      type !== 'button'
    ) {
      // If Cmd/Ctrl is held, check if it's a standard text editing operation
      if (e.metaKey || e.ctrlKey) {
        const key = e.key.toLowerCase();

        // 1. Standard Editing Shortcuts (Copy, Paste, Undo, Select All)
        if (['a', 'c', 'v', 'x', 'z', 'y'].includes(key)) return true;

        // 1b. Rich-text formatting shortcuts (bold, italic, underline).
        // Used by contentEditable editors like TipTap. Only protect when
        // the target is actually rich (contentEditable) — plain <input>
        // and <textarea> don't interpret these.
        if (target.isContentEditable && ['b', 'i', 'u'].includes(key))
          return true;

        // 2. Text Navigation (Cmd+Arrows on Mac, Ctrl+Arrows on Win)
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key))
          return true;

        // 3. Deletion (Cmd+Backspace delete line, Ctrl+Backspace delete word)
        if (['backspace', 'delete'].includes(key)) return true;

        // Otherwise, it's likely a browser/app shortcut (Cmd+R, Cmd+P, etc)
        return false;
      }
      // Simple typing/arrows in text box -> consume
      return true;
    }
  }

  // --- 2. Select Dropdowns (<select>) ---
  if (tagName === 'SELECT') {
    // Selects consume almost everything for navigation and type-ahead
    // But they usually ignore Cmd/Ctrl shortcuts
    if (e.metaKey || e.ctrlKey) return false;
    return true;
  }

  // --- 3. Sliders (<input type="range">) ---
  if (tagName === 'INPUT' && (target as HTMLInputElement).type === 'range') {
    // Sliders consume all navigation keys
    const isSliderNav = [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'PageUp',
      'PageDown',
    ].includes(e.key);

    // Even with modifiers, sliders might use these (e.g. Shift+Arrow),
    // so we generally protect them unless it's a clear browser shortcut (Cmd+R).
    // Safest bet: If it's a nav key, keep it.
    if (isSliderNav) return true;
  }

  // --- 4. Native Media (<video>, <audio>) ---
  if (tagName === 'VIDEO' || tagName === 'AUDIO') {
    // Media consumes keys but usually ignores modifiers.
    // e.g. 'Space' pauses, but 'Cmd+Space' should tunnel.
    // e.g. 'ArrowRight' seeks, but 'Cmd+ArrowRight' should tunnel (History).
    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    const isMediaKey = [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      ' ',
      'Enter',
      'm',
      'f',
      'k',
      'j',
      'l', // Standard Youtube/HTML5 shortcuts
    ].includes(e.key);

    if (isMediaKey) return true;
  }

  // --- 5. Activation Keys (Space/Enter) on Toggles ---
  // Buttons, Checkboxes, Radios, Summaries (Details), Links
  const isActivatable =
    tagName === 'BUTTON' ||
    tagName === 'SUMMARY' ||
    tagName === 'A' ||
    (tagName === 'INPUT' &&
      ['checkbox', 'radio', 'button', 'submit', 'reset'].includes(
        (target as HTMLInputElement).type,
      ));

  if (isActivatable) {
    // Space and Enter activate these elements.
    if (e.key === ' ' || e.key === 'Enter') {
      // BUT: Cmd+Enter is often "Send" or "Open in New Tab".
      // Cmd+Space might be system search.
      // If modifiers are held, let it tunnel.
      if (!(e.metaKey || e.ctrlKey || e.shiftKey)) return true;
    }
  }

  return false;
}
