import { useEffect, type RefObject } from 'react';

/**
 * Shield a floating surface (menu, popover, …) from dismissing ambient
 * floating-ui surfaces (Combobox, open Popover) that it is rendered
 * alongside — but NOT inside — in the React tree.
 *
 * Base-UI / floating-ui attach document-capture listeners for outside-press
 * detection. When this floating surface is rendered via its own portal but
 * the React owner lives outside the ambient popup, the ambient surface
 * sees the click as "outside" and dismisses itself.
 *
 * The hook installs earlier capture-phase listeners that silence those
 * native events once the click is confirmed to be inside `ref`.
 *
 * - `stopImmediatePropagation` blocks floating-ui's document-level dismiss.
 * - `preventDefault` blocks the browser's default focus-on-mousedown, which
 *   would otherwise move DOM focus out of the ambient popup (e.g. away
 *   from a Combobox input) and trigger a `focusOut` dismiss.
 * - `click` is NOT intercepted — React delegates `click` to the React
 *   root, so button onClick handlers inside the shielded area still fire.
 */
export function useFloatingIsolation(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const shield = (e: MouseEvent | PointerEvent) => {
      const root = ref.current;
      if (!root) return;
      if (root.contains(e.target as Node)) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    document.addEventListener('mousedown', shield, true);
    document.addEventListener('pointerdown', shield, true);
    return () => {
      document.removeEventListener('mousedown', shield, true);
      document.removeEventListener('pointerdown', shield, true);
    };
  }, [ref, enabled]);
}
