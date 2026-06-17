/**
 * Maximum diff line delta rendered as an exact number. Anything strictly
 * greater is collapsed to `MANY` so the compact diff badges (file-tree toggle
 * button, diff tab control, per-file rows) don't blow up to six-digit counts
 * that overflow their containers and carry no useful signal at that scale.
 */
export const DIFF_COUNT_MANY_THRESHOLD = 10_000;

/**
 * Format a diff line count for the compact +/- badges. Returns the raw number
 * as a string, or `MANY` once it exceeds {@link DIFF_COUNT_MANY_THRESHOLD}.
 * The sign prefix (`+` / `-`) is rendered by the caller, so `+1034848`
 * becomes `+MANY`.
 */
export function formatDiffCount(value: number): string {
  return value > DIFF_COUNT_MANY_THRESHOLD ? 'MANY' : String(value);
}
