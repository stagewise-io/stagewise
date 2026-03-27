/**
 * Generic directory tree formatter.
 *
 * Accepts an abstract tree of files and directories, applies configurable
 * truncation (total count + per-directory count), and produces a compact
 * text representation suitable for LLM context injection.
 *
 * This module is intentionally filesystem-agnostic — callers build the
 * `TreeEntry[]` input however they like (from `fs.readdir`, from a
 * pre-built index, from an API response, etc.).
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single entry in the tree. Directories may contain nested `children`.
 *
 * `metadata` is an optional key-value bag rendered inline after the name
 * when the `metadataKeys` option is provided.
 */
export interface TreeEntry {
  /** Display name (e.g. `"index.ts"`, `"src"`). */
  name: string;
  /** Whether this entry is a directory. */
  isDirectory: boolean;
  /** Nested children (only meaningful when `isDirectory` is true). */
  children?: TreeEntry[];
  /**
   * Optional metadata key-value pairs.
   * Only keys listed in `FormatTreeOptions.metadataKeys` are rendered.
   */
  metadata?: Record<string, string | number>;
}

/**
 * Default per-depth entry limits.
 *
 * - depth 0 (top-level): 20 entries
 * - depth 1 (children):  10 entries
 * - depth 2 (grandchildren): 5 entries
 *
 * Depths beyond the array length use the last value.
 */
const DEFAULT_MAX_ENTRIES_PER_DEPTH = [20, 10, 5];

/** Default maximum depth to render (0-indexed). */
const DEFAULT_MAX_DEPTH = 2;

/**
 * Options for `formatDirectoryTree()`.
 *
 * All limits are optional — omit to use sensible defaults.
 */
export interface FormatTreeOptions {
  /**
   * Maximum total entries emitted across the entire tree.
   * Once reached, remaining entries are replaced with a `…` summary.
   * @default Infinity
   */
  maxTotalEntries?: number;

  /**
   * Per-depth entry limits. Index 0 = top-level, 1 = first children, etc.
   * Depths beyond the array length use the last element as the cap.
   *
   * Excess children at any level are collapsed into `… +N more`.
   *
   * @default [20, 10, 5]
   */
  maxEntriesPerDepth?: number[];

  /**
   * Maximum depth to render (0-indexed).
   * Depth 0 = only the provided entries, 1 = their immediate children, etc.
   *
   * Children beyond this depth are not traversed.
   *
   * @default 2
   */
  maxDepth?: number;

  /**
   * Metadata keys to render for each entry.
   * Keys are printed in the order specified.
   * Only keys present on the entry's `metadata` bag are shown.
   *
   * When `undefined` or empty, no metadata is rendered.
   *
   * @example ['size', 'modified']
   * // renders:  index.ts  (size:4.2KB modified:2025-03-23)
   */
  metadataKeys?: string[];
}

/**
 * Result of `formatDirectoryTree()`.
 */
export interface FormatTreeResult {
  /** The formatted tree text. */
  text: string;
  /** Total number of entries emitted (before truncation summary lines). */
  totalEntries: number;
  /** Whether the output was truncated by any limit. */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Internal counters
// ---------------------------------------------------------------------------

interface Counters {
  emitted: number;
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format a tree of `TreeEntry` nodes into a compact text representation.
 *
 * Output format (compact, no box-drawing chars — saves tokens):
 * ```
 * src/
 *   components/
 *     button.tsx  (size:1.2KB)
 *     modal.tsx  (size:3.4KB)
 *   index.ts  (size:200B)
 * README.md  (size:800B)
 * ```
 *
 * Directories are sorted first, then files, both alphabetical within group.
 */
export function formatDirectoryTree(
  entries: TreeEntry[],
  options: FormatTreeOptions = {},
): FormatTreeResult {
  const {
    maxTotalEntries = Number.POSITIVE_INFINITY,
    maxEntriesPerDepth = DEFAULT_MAX_ENTRIES_PER_DEPTH,
    maxDepth = DEFAULT_MAX_DEPTH,
    metadataKeys,
  } = options;

  const counters: Counters = { emitted: 0, truncated: false };
  const lines: string[] = [];

  const sorted = sortEntries(entries);
  renderEntries(sorted, '', 0, lines, counters, {
    maxTotalEntries,
    maxEntriesPerDepth,
    maxDepth,
    metadataKeys,
  });

  return {
    text: lines.join('\n'),
    totalEntries: counters.emitted,
    truncated: counters.truncated,
  };
}

// ---------------------------------------------------------------------------
// Internal rendering
// ---------------------------------------------------------------------------

interface ResolvedOptions {
  maxTotalEntries: number;
  maxEntriesPerDepth: number[];
  maxDepth: number;
  metadataKeys?: string[];
}

/**
 * Resolve the entry cap for a given depth.
 * Falls back to the last element if depth exceeds the array length.
 */
function capForDepth(depth: number, caps: number[]): number {
  if (caps.length === 0) return Number.POSITIVE_INFINITY;
  return caps[Math.min(depth, caps.length - 1)];
}

function renderEntries(
  entries: TreeEntry[],
  indent: string,
  depth: number,
  lines: string[],
  counters: Counters,
  opts: ResolvedOptions,
): void {
  // Per-depth cap: show at most N entries at this level.
  const cap = capForDepth(depth, opts.maxEntriesPerDepth);
  const overDirLimit = entries.length > cap;
  const visible = overDirLimit ? entries.slice(0, cap) : entries;
  const hidden = overDirLimit ? entries.length - cap : 0;

  for (const entry of visible) {
    if (counters.emitted >= opts.maxTotalEntries) {
      counters.truncated = true;
      return;
    }

    const suffix = entry.isDirectory ? '/' : '';
    const meta = formatMeta(entry.metadata, opts.metadataKeys);
    lines.push(`${indent}${entry.name}${suffix}${meta}`);
    counters.emitted++;

    if (
      entry.isDirectory &&
      entry.children &&
      entry.children.length > 0 &&
      depth < opts.maxDepth
    ) {
      const sortedChildren = sortEntries(entry.children);
      renderEntries(
        sortedChildren,
        `${indent}  `,
        depth + 1,
        lines,
        counters,
        opts,
      );
    }
  }

  if (hidden > 0) {
    lines.push(`${indent}… +${hidden} more`);
    counters.truncated = true;
  }
}

function formatMeta(
  metadata: Record<string, string | number> | undefined,
  keys: string[] | undefined,
): string {
  if (!metadata || !keys || keys.length === 0) return '';
  const parts: string[] = [];
  for (const k of keys) {
    if (k in metadata) {
      parts.push(`${k}:${metadata[k]}`);
    }
  }
  return parts.length > 0 ? `  (${parts.join(' ')})` : '';
}

function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    // Directories first.
    const aDir = a.isDirectory ? 0 : 1;
    const bDir = b.isDirectory ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.name.localeCompare(b.name);
  });
}
