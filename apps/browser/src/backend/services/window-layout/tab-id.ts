/**
 * Monotonic tab ID counter — mimics Chrome's per-session integer tab IDs.
 *
 * IDs start at 1 and increment on each call to `generateTabId()`.
 * Unlike the old random-bytes approach, IDs are sequential, never collide,
 * and need no collision-check parameter.
 *
 * `resetTabIdCounter()` must be called exactly once at cold start
 * (i.e. in the `WindowLayoutService` constructor).
 */

let nextTabId = 1;

/**
 * Returns the next tab ID as a string (e.g. `"1"`, `"2"`, …).
 * The string representation keeps the rest of the codebase unchanged
 * since `browserTabSnapshotSchema.id` is typed as `z.string()`.
 */
export function generateTabId(): string {
  return String(nextTabId++);
}

/**
 * Resets the counter back to 1.
 * Call this once per process lifetime — in `WindowLayoutService` constructor.
 */
export function resetTabIdCounter(): void {
  nextTabId = 1;
}
