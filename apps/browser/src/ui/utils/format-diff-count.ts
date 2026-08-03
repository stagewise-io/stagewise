export const DIFF_COUNT_MANY_THRESHOLD = 10_000;

export function formatDiffCount(value: number): string {
  return value > DIFF_COUNT_MANY_THRESHOLD ? 'MANY' : String(value);
}
