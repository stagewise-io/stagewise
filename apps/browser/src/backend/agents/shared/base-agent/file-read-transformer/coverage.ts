/**
 * Read-params coverage logic for file injection deduplication.
 *
 * When the model context already contains a file at a given hash, we need
 * to decide whether a new read request adds value or is redundant.
 *
 * ## Heuristics
 *
 * 1. **Preview vs full are different representations.** A preview is a
 *    structural overview; it never covers a full read and vice-versa.
 *    Two preview requests for the same hash are always considered
 *    equivalent (preview output is deterministic for a given hash).
 *
 * 2. **Unbounded ranges cover everything.** If an existing entry has no
 *    `startLine`/`endLine` (or `startPage`/`endPage`), it represents the
 *    full content on that axis and covers any bounded sub-range.
 *
 * 3. **Bounded ranges are compared inclusively.** `[existStart, existEnd]`
 *    covers `[reqStart, reqEnd]` iff `existStart <= reqStart` and
 *    `existEnd >= reqEnd`.
 *
 * 4. **Line and page axes are independent.** Both must be covered for the
 *    request to be considered redundant.
 *
 * 5. **Depth coverage.** An existing depth covers a requested depth when
 *    the existing depth is >= the requested depth (deeper listing subsumes
 *    shallower). Unbounded depth (undefined) covers any specific depth.
 *    A specific depth never covers unbounded (meaning "use default") since
 *    the default could be larger.
 *
 * 6. **Hash changes always trigger re-injection.** If the file content
 *    hash differs from any previously seen entry for the same path, the
 *    coverage check is not even attempted — the file is re-injected.
 */

import type { ReadParams } from './types';

// ---------------------------------------------------------------------------
// Range coverage
// ---------------------------------------------------------------------------

/**
 * Check whether an existing range `[exStart, exEnd]` fully contains the
 * requested range `[reqStart, reqEnd]`.
 *
 * `undefined` bounds have directional meaning:
 *   - `undefined` start → beginning of file (treated as 1)
 *   - `undefined` end   → end of file (treated as +∞)
 *
 * If the existing range is fully unbounded it covers any request.
 * If the requested range is fully unbounded it can only be covered by
 * another fully unbounded range (i.e. the full axis was already loaded).
 */
function isRangeCoveredBy(
  reqStart: number | undefined,
  reqEnd: number | undefined,
  exStart: number | undefined,
  exEnd: number | undefined,
): boolean {
  // Existing is unbounded on both sides → covers everything.
  if (exStart === undefined && exEnd === undefined) return true;

  // Existing has bounds but requested is unbounded → not covered.
  if (reqStart === undefined && reqEnd === undefined) return false;

  // Remaining cases: at least one side is bounded on either existing or
  // requested (or both). Normalise to concrete numbers for comparison.
  // Single-sided unbounded ranges are handled correctly here because the
  // undefined side maps to the extremum (1 or +∞), so e.g.
  //   existing = [5, ∞) vs requested = [1, ∞) → 5 > 1 → not covered ✓
  //   existing = [1, 50] vs requested = [1, ∞) → 50 < ∞ → not covered ✓
  const effReqStart = reqStart ?? 1;
  const effReqEnd = reqEnd ?? Number.MAX_SAFE_INTEGER;
  const effExStart = exStart ?? 1;
  const effExEnd = exEnd ?? Number.MAX_SAFE_INTEGER;

  return effExStart <= effReqStart && effExEnd >= effReqEnd;
}

// ---------------------------------------------------------------------------
// Depth coverage
// ---------------------------------------------------------------------------

/**
 * Check whether an existing depth fully covers the requested depth.
 *
 * - `undefined` means "use transformer default" — treated as unbounded
 *   for coverage purposes (the default could be any value).
 * - An existing `undefined` (default) covers any specific requested depth
 *   because the default was used and delivered whatever it delivered.
 * - A specific existing depth covers a request only if `existing >= requested`.
 * - A specific existing depth does NOT cover an `undefined` request because
 *   the default might be deeper.
 */
function isDepthCoveredBy(
  reqDepth: number | undefined,
  exDepth: number | undefined,
): boolean {
  // Existing used default → it delivered the transformer's default depth.
  // Covers any specific request ≤ that default, but since we don't know
  // the default, we conservatively say it covers only another default or
  // any specific depth (the default is always the transformer's max).
  if (exDepth === undefined) return true;

  // Existing is specific but requested is default → not safe to assume covered.
  if (reqDepth === undefined) return false;

  // Both specific → existing must be at least as deep.
  return exDepth >= reqDepth;
}

// ---------------------------------------------------------------------------
// ReadParams coverage
// ---------------------------------------------------------------------------

/**
 * Returns `true` if `existing` already fully covers what `requested` asks
 * for — meaning re-injecting the file would be redundant.
 *
 * Both params objects are assumed to belong to the **same path + hash**.
 */
export function isReadParamsCoveredBy(
  requested: ReadParams,
  existing: ReadParams,
): boolean {
  const reqPreview = requested.preview ?? false;
  const exPreview = existing.preview ?? false;

  // Preview and non-preview are fundamentally different representations.
  // A preview never satisfies a full-content request and vice-versa.
  if (reqPreview !== exPreview) return false;

  // Both preview → deterministic output for the same hash; always covered.
  if (reqPreview && exPreview) return true;

  // Both non-preview → check line and page ranges independently.
  if (
    !isRangeCoveredBy(
      requested.startLine,
      requested.endLine,
      existing.startLine,
      existing.endLine,
    )
  )
    return false;

  if (
    !isRangeCoveredBy(
      requested.startPage,
      requested.endPage,
      existing.startPage,
      existing.endPage,
    )
  )
    return false;

  // Depth coverage: a deeper (or equal) existing depth covers a shallower request.
  if (!isDepthCoveredBy(requested.depth, existing.depth)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// SeenFilesTracker
// ---------------------------------------------------------------------------

/**
 * Tracks which files (by path + content hash) have already been injected
 * into the model context, **including the read parameters used**.
 *
 * Replaces the former `Set<string>` approach which only tracked
 * `${path}:${hash}` and could not distinguish between a preview read
 * and a full read, or between different line/page ranges.
 *
 * ### Decision flow (per file reference)
 *
 * 1. Build key = `${path}:${hash}`.
 * 2. Call `isCovered()` — returns `true` if any previously recorded
 *    entry fully covers the current request.
 * 3. If not covered, run the transformer, then call `record()` with
 *    the **effective** params (what was actually delivered, which may
 *    be narrower than requested if the transformer truncated).
 *
 * This two-phase API ensures the tracker stores what the model *actually*
 * received, not what was requested — preventing false coverage when
 * transformers truncate large files.
 */
export class SeenFilesTracker {
  /**
   * Key: `${mountedPath}:${contentHash}`
   * Value: list of `ReadParams` that have been injected for that key.
   */
  private readonly entries = new Map<string, ReadParams[]>();

  private static buildKey(path: string, hash: string): string {
    return `${path}:${hash}`;
  }

  /**
   * Check whether injecting this file with the given params would be
   * redundant because a previous injection already covers the request.
   *
   * **Does not modify internal state.** Call `record()` separately after
   * the transformer has run.
   *
   * @returns `true` if the file should be **skipped** (already covered).
   */
  isCovered(path: string, hash: string, params: ReadParams): boolean {
    const key = SeenFilesTracker.buildKey(path, hash);
    const existing = this.entries.get(key);
    if (!existing) return false;

    for (const prev of existing) {
      if (isReadParamsCoveredBy(params, prev)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Record that a file was injected with the given **effective** params
   * (what the transformer actually delivered). Future `isCovered()` calls
   * will consider this entry.
   *
   * @param effectiveParams — The params describing the content that was
   *   actually delivered. Use `FileTransformResult.effectiveReadParams`
   *   when available; fall back to the originally requested params.
   */
  record(path: string, hash: string, effectiveParams: ReadParams): void {
    const key = SeenFilesTracker.buildKey(path, hash);
    const existing = this.entries.get(key);
    if (existing) {
      existing.push(effectiveParams);
    } else {
      this.entries.set(key, [effectiveParams]);
    }
  }
}
