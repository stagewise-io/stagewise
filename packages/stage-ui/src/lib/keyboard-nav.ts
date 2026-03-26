import type React from 'react';

/**
 * Translates Ctrl+N / Ctrl+P into ArrowDown / ArrowUp by
 * dispatching a synthetic keyboard event on the same target.
 *
 * Call early in an `onKeyDown` handler. If the event matches,
 * it is prevented and a replacement arrow event is dispatched
 * so that Base UI's internal navigation picks it up.
 */
export function handleCtrlNavKeys(
  event: React.KeyboardEvent<HTMLElement>,
): void {
  const isCtrlOnly =
    event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;

  if (!isCtrlOnly) return;

  let arrowKey: string | null = null;
  if (event.key === 'n') arrowKey = 'ArrowDown';
  else if (event.key === 'p') arrowKey = 'ArrowUp';

  if (!arrowKey) return;

  event.preventDefault();
  event.stopPropagation();

  event.nativeEvent.target?.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: arrowKey,
      code: arrowKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}
