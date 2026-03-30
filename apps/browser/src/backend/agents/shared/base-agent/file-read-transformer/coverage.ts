/**
 * File injection deduplication for user mentions and attachments.
 *
 * Agent `readFile` calls are **never** deduplicated — the agent decides
 * what to re-read. Only user-mentioned files and sandbox attachments use
 * this tracker to avoid re-injecting the same (path, hash) pair within a
 * single conversation window.
 *
 * A `(path, hash)` pair is considered "covered" if it has already been
 * injected with any read params. Since user mentions are always previews
 * (deterministic per hash), the same hash always produces the same output
 * and re-injection adds no value.
 */

// ---------------------------------------------------------------------------
// SeenFilesTracker
// ---------------------------------------------------------------------------

/**
 * Tracks which (path, hash) pairs have already been injected into the
 * model context within the current conversation window.
 *
 * Replaces the former coverage-aware implementation that tracked
 * `ReadParams` ranges. The simplified contract is:
 *   - User mentions are always `preview` mode — same hash = same output.
 *   - Attachments are always full — same hash = same output.
 *   - Agent reads bypass this tracker entirely (no dedup).
 *
 * Therefore a plain `Set<"path:hash">` is sufficient.
 */
export class SeenFilesTracker {
  private readonly seen = new Set<string>();

  private static buildKey(path: string, hash: string): string {
    return `${path}:${hash}`;
  }

  /**
   * Returns `true` if this `(path, hash)` pair was already injected —
   * i.e. injection would be redundant.
   */
  isCovered(path: string, hash: string): boolean {
    return this.seen.has(SeenFilesTracker.buildKey(path, hash));
  }

  /**
   * Record that `(path, hash)` was injected into the model context.
   * Future `isCovered()` calls for the same pair will return `true`.
   */
  record(path: string, hash: string): void {
    this.seen.add(SeenFilesTracker.buildKey(path, hash));
  }
}
