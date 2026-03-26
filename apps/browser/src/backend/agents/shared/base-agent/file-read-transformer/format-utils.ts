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
 * Hard maximum number of lines a text-based transformer may return in
 * a single read (full or line-range). Prevents unbounded context-window
 * consumption for very large files.
 *
 * When the output exceeds this limit, transformers **must** truncate and
 * report the truncation via `effectiveReadParams` so the coverage tracker
 * knows the true extent of delivered content — allowing the agent to
 * request subsequent ranges without false cache/coverage hits.
 *
 * Configurable at import time for testing via `setMaxReadLines()`.
 */
let _maxReadLines = 500;

/** Maximum lines returned in a single full/range read. */
export function getMaxReadLines(): number {
  return _maxReadLines;
}

/** Override the max-read-lines limit (for testing or configuration). */
export function setMaxReadLines(n: number): void {
  if (n < 1) throw new RangeError('maxReadLines must be >= 1');
  _maxReadLines = n;
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
