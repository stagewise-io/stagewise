import { hasMatch, score, SCORE_MIN, SCORE_MAX } from 'fzy.js';

/**
 * Batch-scores how well `query` matches each string in `haystack` using fzy.js.
 * Returns a Map from haystack index to a 0-1 score (higher = better match).
 * Items not in the map did not match at all.
 */
export function batchFuzzyScore(
  query: string,
  haystack: string[],
): Map<number, number> {
  if (!query || haystack.length === 0) return new Map();

  const lowerQuery = query.toLowerCase();

  const raw: Array<{ idx: number; score: number }> = [];
  let maxScore = SCORE_MIN;

  for (let i = 0; i < haystack.length; i++) {
    const entry = haystack[i]!;
    if (!hasMatch(lowerQuery, entry.toLowerCase())) continue;

    const s = score(lowerQuery, entry.toLowerCase());
    if (s === SCORE_MIN) continue;

    raw.push({ idx: i, score: s });
    if (s !== SCORE_MAX && s > maxScore) maxScore = s;
  }

  if (raw.length === 0) return new Map();

  const scores = new Map<number, number>();

  for (const { idx, score: s } of raw) {
    if (s === SCORE_MAX) scores.set(idx, 1);
    else if (maxScore <= 0) scores.set(idx, 0.5);
    else scores.set(idx, Math.max(0, s / maxScore));
  }

  return scores;
}
