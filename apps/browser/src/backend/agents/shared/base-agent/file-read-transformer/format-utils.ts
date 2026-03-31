/**
 * Shared formatting utilities used by the file-read-transformer pipeline
 * and individual transformers.
 *
 * Extracted to avoid circular imports between the main entry point and
 * the transformer implementations.
 */

// ---------------------------------------------------------------------------
// Byte formatting
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const val = bytes / 1024 ** i;
  return `${val < 10 ? val.toFixed(1) : Math.round(val)}${units[i]}`;
}

// ---------------------------------------------------------------------------
// Language inference
// ---------------------------------------------------------------------------

/** Map common extensions to a language identifier for metadata. */
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.rb': 'ruby',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.html': 'html',
  '.htm': 'html',
  '.json': 'json',
  '.jsonc': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  '.ps1': 'powershell',
  '.r': 'r',
  '.lua': 'lua',
  '.php': 'php',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.ml': 'ocaml',
  '.dart': 'dart',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
  '.tf': 'terraform',
  '.proto': 'protobuf',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.dockerfile': 'dockerfile',
  '.cmake': 'cmake',
  '.makefile': 'makefile',
};

export function inferLanguage(ext: string): string | undefined {
  return LANGUAGE_MAP[ext];
}

// ---------------------------------------------------------------------------
// Binary detection
// ---------------------------------------------------------------------------

/**
 * Heuristic check: is this buffer likely binary (non-textual) data?
 *
 * Checks for:
 *  1. Null bytes (`\x00`) in the first 8 KB — almost never appear in
 *     legitimate text/code files but are ubiquitous in binary formats.
 *  2. Unicode replacement characters (`\uFFFD`) indicating invalid UTF-8
 *     sequences that could not be decoded.
 *  3. UTF-8 round-trip mismatch — if re-encoding the decoded string
 *     produces a different byte length, the original was not valid UTF-8.
 *
 * Returns `true` when the content should be treated as binary.
 */
export function isBinaryBuffer(buf: Buffer): boolean {
  // Check first 8 KB for null bytes (fast path for most binary formats).
  const checkLen = Math.min(buf.length, 8192);
  for (let i = 0; i < checkLen; i++) {
    if (buf[i] === 0x00) return true;
  }

  // Decode and check for replacement chars + round-trip fidelity.
  const text = buf.toString('utf-8');
  if (text.includes('\uFFFD')) return true;
  if (Buffer.from(text, 'utf-8').length !== buf.length) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Content limits
// ---------------------------------------------------------------------------

/**
 * Maximum character budget for a single file read, derived from the
 * model's context-window size.  The budget targets ~10 % of the context
 * window: `contextWindowTokens * 0.10 * 4` chars (≈ 4 chars/token).
 *
 * When the output exceeds this budget, transformers **must** truncate
 * and report the truncation via `effectiveReadParams` so the coverage
 * tracker knows the true extent of delivered content — allowing the
 * agent to request subsequent ranges without false cache/coverage hits.
 *
 * Configurable via `setMaxReadChars()`.  A convenience setter
 * `setMaxReadCharsFromContextWindow()` derives the budget from a token
 * count.
 *
 */
let _maxReadChars = 500 * 80; // sensible default ≈ 500 lines × 80 chars

/** Maximum characters returned in a single full/range read. */
export function getMaxReadChars(): number {
  return _maxReadChars;
}

/** Override the max-read-chars limit directly. */
export function setMaxReadChars(n: number): void {
  if (n < 1) throw new RangeError('maxReadChars must be >= 1');
  _maxReadChars = n;
}

/**
 * Derive and set the char budget from a context-window size (in tokens).
 *
 * Formula: `contextWindowTokens * 0.10 * 4`  (10 % of the window, ≈ 4
 * chars per token).  Result is floored with a minimum of 4 000 chars
 * (~50 lines) so very small windows don't become unusable.
 *
 * @deprecated Prefer `deriveMaxReadChars()` + passing the budget
 *   explicitly via `TransformerContext.maxReadChars`.
 */
export function setMaxReadCharsFromContextWindow(
  contextWindowTokens: number,
): void {
  const budget = deriveMaxReadChars(contextWindowTokens);
  setMaxReadChars(budget);
}

/**
 * Pure function that derives a per-read character budget from a
 * context-window size (in tokens).
 *
 * Formula: `contextWindowTokens * 0.10 * 4` (10% of window, ≈4 chars/token).
 * Result is floored with a minimum of 4 000 chars (~50 lines).
 *
 * Use this to obtain a budget value that can be threaded through the
 * pipeline without mutating module-level state.
 */
export function deriveMaxReadChars(contextWindowTokens: number): number {
  return Math.max(4_000, Math.floor(contextWindowTokens * 0.1 * 4));
}

/**
 * Given an array of text lines, determine how many can be included
 * within the current `maxReadChars` budget, starting from index 0.
 *
 * Returns the number of lines that fit.  Each line's length plus 1
 * (for the newline separator) is accumulated until the budget is
 * exhausted.  At least 1 line is always returned when `lines` is
 * non-empty.
 */
export function countLinesFittingBudget(
  lines: readonly string[],
  budget: number = _maxReadChars,
): number {
  if (lines.length === 0) return 0;
  let chars = 0;
  for (let i = 0; i < lines.length; i++) {
    // +1 for the newline separator (or the line-number prefix overhead)
    const lineCost = lines[i].length + 1;
    if (chars + lineCost > budget && i > 0) return i;
    chars += lineCost;
  }
  return lines.length;
}

/**
 * Hard maximum number of lines returned in preview mode.
 * Configurable via `setMaxPreviewLines()`.
 */
let _maxPreviewLines = 30;

/** Maximum lines returned in preview mode. */
export function getMaxPreviewLines(): number {
  return _maxPreviewLines;
}

/** Override the max-preview-lines limit (for testing or configuration). */
export function setMaxPreviewLines(n: number): void {
  if (n < 1) throw new RangeError('maxPreviewLines must be >= 1');
  _maxPreviewLines = n;
}

// ---------------------------------------------------------------------------
// Shared text truncation
// ---------------------------------------------------------------------------

import type { ReadParams } from './types';

/**
 * Shared truncation logic for text-based transformers.
 *
 * Handles both **line-range** and **full-content** reads with
 * character-budget enforcement. Returns the line-numbered output text,
 * the effective read params (reflecting any truncation), and metadata
 * fields (`lines`, `chars`).
 *
 * Transformers should call this for any non-preview, non-binary text
 * read. Preview mode is intentionally excluded because each transformer
 * implements its own preview logic (e.g. markdown heading outline,
 * text-blob type label, etc.).
 */
export function truncateTextContent(
  allLines: readonly string[],
  readParams: ReadParams,
  explicitBudget?: number,
): {
  output: string;
  effectiveReadParams?: ReadParams;
} {
  const totalLines = allLines.length;
  const { startLine, endLine } = readParams;
  const budget = explicitBudget ?? getMaxReadChars();

  // ── Line-range slicing ───────────────────────────────────────────
  if (startLine !== undefined || endLine !== undefined) {
    const sl = Math.max(1, startLine ?? 1);
    const requestedEnd = Math.min(totalLines, endLine ?? totalLines);
    const rangeLines = allLines.slice(sl - 1, requestedEnd);
    const fitCount = countLinesFittingBudget(rangeLines, budget);
    const el = sl + fitCount - 1;
    const truncated = el < requestedEnd;
    const slice = allLines.slice(sl - 1, el);
    let numbered = prefixLineNumbers(slice.join('\n'), sl);

    if (truncated) {
      numbered += `\n… (truncated — token budget reached, ${requestedEnd - el} more lines until line ${requestedEnd})`;
    }

    return {
      output: numbered,
      effectiveReadParams: { startLine: sl, endLine: el },
    };
  }

  // ── Full content (capped by char budget) ──────────────────────────
  const fitCount = countLinesFittingBudget(allLines as string[], budget);
  const cappedEnd = Math.min(totalLines, fitCount);
  const truncated = cappedEnd < totalLines;
  const outputLines = truncated ? allLines.slice(0, cappedEnd) : allLines;
  let numbered = prefixLineNumbers((outputLines as string[]).join('\n'));

  if (truncated) {
    numbered += `\n… (truncated — token budget reached, ${totalLines - cappedEnd} more lines remaining)`;
    return {
      output: numbered,
      effectiveReadParams: { startLine: 1, endLine: cappedEnd },
    };
  }

  return { output: numbered };
}

// ---------------------------------------------------------------------------
// Line-number prefixing
// ---------------------------------------------------------------------------

/**
 * Prefix every line with its 1-indexed line number and a `|` separator.
 *
 * The `startLine` parameter allows callers to offset numbering when only
 * a slice of the file is being displayed (e.g. starting from line 50).
 */
export function prefixLineNumbers(text: string, startLine = 1): string {
  const lines = text.split('\n');
  return lines.map((line, i) => `${startLine + i}|${line}`).join('\n');
}

// ---------------------------------------------------------------------------
// Base metadata
// ---------------------------------------------------------------------------

/**
 * Build the standard metadata fields present on every transformer result.
 */
export function baseMetadata(
  sizeBytes: number,
  mtime: Date,
): Record<string, string> {
  return {
    size: formatBytes(sizeBytes),
    modified: mtime.toISOString(),
  };
}
