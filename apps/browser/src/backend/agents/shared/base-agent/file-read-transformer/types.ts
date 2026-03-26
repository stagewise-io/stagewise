/**
 * Core types for the file-read-transformer pipeline.
 *
 * These define the interface between the central `fileReadTransformer()`
 * entry point, the per-type transformers (Phase 8), and the cache layer.
 */

import type { TextPart, ImagePart, FilePart } from 'ai';
import type { FileReadCacheService } from '@/services/file-read-cache';
import type { Logger } from '@/services/logger';

// ---------------------------------------------------------------------------
// Read parameters
// ---------------------------------------------------------------------------

/**
 * Optional parameters that control how a file's content is read and
 * presented. These originate from the readFile tool's input schema
 * (start_line, end_line, start_page, end_page, preview) and flow
 * through the transformer pipeline so each transformer can adapt its
 * output accordingly.
 *
 * When no read params are provided, transformers produce the full
 * default representation of the file.
 */
export interface ReadParams {
  /** 1-indexed inclusive start line (text files). */
  startLine?: number;
  /** 1-indexed inclusive end line (text files). */
  endLine?: number;
  /** 1-indexed inclusive start page (paginated content like PDFs). */
  startPage?: number;
  /** 1-indexed inclusive end page (paginated content like PDFs). */
  endPage?: number;
  /** When true, produce a heavily truncated structural preview. */
  preview?: boolean;
  /**
   * Maximum depth for tree-like content (directories, archives, disk images).
   * 0 = direct children only, 1 = children + grandchildren, etc.
   * When omitted, each transformer uses its own default.
   */
  depth?: number;
}

// ---------------------------------------------------------------------------
// Transformer result
// ---------------------------------------------------------------------------

/**
 * The output of a file transformer. Contains metadata key-value pairs
 * and model message parts ready for context injection.
 */
export interface FileTransformResult {
  /**
   * Key-value metadata pairs rendered into the `<metadata>` XML tag.
   *
   * Standard keys (always present):
   *   - `size` — human-readable file size (e.g. `"4.2KB"`)
   *   - `modified` — ISO 8601 last-modified timestamp
   *
   * Type-specific keys (added by each transformer):
   *   - Images: `dimensions`, `format`
   *   - Code/text: `language`, `lines`
   *   - Directories: `entries`, `depth`
   */
  metadata: Record<string, string>;

  /** Model message parts: text, image, or file. */
  parts: (TextPart | ImagePart | FilePart)[];

  /**
   * The read parameters that describe what the transformer **actually
   * delivered**, which may differ from what was requested.
   *
   * Example: the caller requests the full file (no line range), but the
   * transformer truncates at 300 lines → `effectiveReadParams` would be
   * `{ startLine: 1, endLine: 300 }` so the coverage tracker knows that
   * lines 301+ were **not** included.
   *
   * When omitted, the coverage tracker falls back to the originally
   * requested params (i.e. assumes the transformer delivered everything
   * that was asked for). Transformers should set this whenever they
   * truncate, cap, or otherwise reduce the output compared to the request.
   */
  effectiveReadParams?: ReadParams;
}

// ---------------------------------------------------------------------------
// Transformer function
// ---------------------------------------------------------------------------

/**
 * A file transformer converts raw file data into a model-ready
 * representation. Each transformer handles one category of file types
 * (images, text, directories, etc.).
 *
 * @param buf — Raw file buffer (empty Buffer for directories).
 * @param mountedPath — Mount-prefixed path (e.g. `"w1/src/app.tsx"`).
 * @param stats — File/directory stat info.
 * @param ctx — Shared context (logger, etc.).
 * @param originalFileName — For `att/` blobs where the stored name is
 *   a random ID; the original filename for extension/language inference.
 */
export type FileTransformer = (
  buf: Buffer,
  mountedPath: string,
  stats: { size: number; mtime: Date; isDirectory: boolean },
  ctx: TransformerContext,
  originalFileName?: string,
) => Promise<FileTransformResult>;

// ---------------------------------------------------------------------------
// Transformer context
// ---------------------------------------------------------------------------

/**
 * Shared context passed through the transformer pipeline. Contains
 * services and identifiers that individual transformers may need.
 */
export interface TransformerContext {
  /** Current agent instance ID. */
  agentId: string;
  /** Map of mount prefix → absolute root path. */
  mountPaths: Map<string, string>;
  /** File-read cache service (post-transformation content). */
  cache: FileReadCacheService;
  /** Logger instance. */
  logger: Logger;
  /**
   * Optional read parameters controlling content slicing and preview.
   *
   * When set, transformers should respect these to produce a subset of
   * the file's content (e.g. specific line range for text, specific page
   * range for PDFs, or a structural preview).
   *
   * Defaults to `{}` (no constraints — full content).
   */
  readParams: ReadParams;
}

// ---------------------------------------------------------------------------
// Cache serialization types
// ---------------------------------------------------------------------------

/**
 * JSON-safe representation of a single model message part.
 * Binary data (images, files) is base64-encoded for storage.
 */
export type SerializedPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; dataBase64: string }
  | {
      type: 'file';
      mediaType: string;
      dataBase64: string;
      filename?: string;
    };

/**
 * JSON-safe representation of a full `FileTransformResult`,
 * suitable for storage in the cache's `content` column.
 */
export interface SerializedTransformResult {
  metadata: Record<string, string>;
  parts: SerializedPart[];
  /** Persisted effective read params so cache hits preserve truncation info. */
  effectiveReadParams?: ReadParams;
}
