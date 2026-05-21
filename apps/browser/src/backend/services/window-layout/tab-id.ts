/**
 * Monotonic tab ID counter.
 *
 * IDs use a non-integer prefix (`tab-1`, `tab-2`, …).  Do not return bare
 * numeric strings: object key enumeration always sorts integer-like keys
 * before normal string keys, which destroys mixed browser/terminal tab order.
 *
 * `resetTabIdCounter()` must be called exactly once at cold start
 * (i.e. in the `WindowLayoutService` constructor).
 */

let nextTabId = 1;

/**
 * Returns the next tab ID as a non-integer string (e.g. `"tab-1"`,
 * `"tab-2"`, …).
 */
export function generateTabId(): string {
  return `tab-${nextTabId++}`;
}

/**
 * Resets the counter back to 1.
 * Call this once per process lifetime — in `WindowLayoutService` constructor.
 */
export function resetTabIdCounter(): void {
  nextTabId = 1;
}
