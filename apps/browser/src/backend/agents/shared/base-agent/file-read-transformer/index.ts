/**
 * Central file-read-transformer entry point.
 *
 * All file content entering the LLM context flows through this pipeline,
 * regardless of origin (user mention, uploaded attachment, agent readFile).
 *
 * Pipeline:
 *   1. Read the file/directory at `mountedPath` via `blobReader`.
 *   2. Compute current SHA-256 hash.
 *   3. Compare against `expectedHash` (from `pathReferences`).
 *      a. Match → check cache → hit → return cached; miss → transform → cache → return.
 *      b. Mismatch → check cache for expectedHash → hit → return cached; miss → fallback text.
 *   4. Wrap the result in `<file>` XML envelope with read-param attributes.
 *
 * Read parameters (`startLine`, `endLine`, `startPage`, `endPage`, `preview`,
 * `depth`) flow through the pipeline and affect:
 *   - Transformer output (content slicing / preview generation)
 *   - Cache key (different params produce separate cache entries)
 *   - XML envelope (read-param attributes on `<file>` tags)
 *   - Deduplication (path+hash via `SeenFilesTracker` — user mentions/attachments only)
 *
 * See `README.md` in this directory for the full architecture documentation.
 */

import nodePath from 'node:path';
import fs from 'node:fs/promises';
import type { TextPart, ImagePart, FilePart } from 'ai';

import { hashBuffer, hashDirectory } from './hash';
import { resolveMountedPath } from './resolve-path';
import {
  serializeTransformResult,
  deserializeTransformResult,
} from './serialization';
import {
  baseMetadata,
  getMaxReadChars,
  getMaxPreviewLines,
} from './format-utils';

/** Default content limits used when callers don't supply explicit values. */
const DEFAULT_MAX_READ_CHARS = 500 * 80;
const DEFAULT_MAX_PREVIEW_LINES = 30;
import type {
  FileTransformResult,
  FileTransformer,
  TransformerContext,
  ReadParams,
} from './types';
import type { BlobReader } from '../utils';
import { FileReadCacheService } from '@/services/file-read-cache';
import type { Logger } from '@/services/logger';
import {
  imageTransformer,
  directoryTransformer,
  textTransformer,
  svgTransformer,
  markdownTransformer,
  textBlobTransformer,
  pdfTransformer,
  archiveTransformer,
  rawImageTransformer,
  diskImageTransformer,
} from './transformers/index';

// ---------------------------------------------------------------------------
// Extension → transformer lookup table
// ---------------------------------------------------------------------------

const TRANSFORMER_BY_EXT: Record<string, FileTransformer> = {
  // Images — convert to WebP q80, return as ImagePart
  '.png': imageTransformer,
  '.jpg': imageTransformer,
  '.jpeg': imageTransformer,
  '.gif': imageTransformer,
  '.webp': imageTransformer,
  '.bmp': imageTransformer,
  '.avif': imageTransformer,
  '.ico': imageTransformer,

  // SVG — return as text (not image)
  '.svg': svgTransformer,

  // Markdown — structured preview with heading outline
  '.md': markdownTransformer,
  '.mdx': markdownTransformer,

  // Structured text blobs
  '.textclip': textBlobTransformer,
  '.swdomelement': textBlobTransformer,

  // PDF — extract text + images per page
  '.pdf': pdfTransformer,

  // Archives — list file tree
  '.zip': archiveTransformer,
  '.jar': archiveTransformer,
  '.war': archiveTransformer,
  '.tar': archiveTransformer,
  '.tgz': archiveTransformer,

  // Raw camera images — EXIF metadata + embedded JPEG preview
  '.nef': rawImageTransformer,
  '.cr2': rawImageTransformer,
  '.cr3': rawImageTransformer,
  '.arw': rawImageTransformer,
  '.dng': rawImageTransformer,
  '.orf': rawImageTransformer,
  '.rw2': rawImageTransformer,
  '.raf': rawImageTransformer,
  '.pef': rawImageTransformer,
  '.srw': rawImageTransformer,
  '.erf': rawImageTransformer,
  '.3fr': rawImageTransformer,
  '.rwl': rawImageTransformer,
  '.mrw': rawImageTransformer,
  '.nrw': rawImageTransformer,
  '.raw': rawImageTransformer,

  // Disk images — ISO 9660 file tree listing / DMG (macOS only)
  '.iso': diskImageTransformer,
  '.img': diskImageTransformer,
  '.dmg': diskImageTransformer,
};

// ---------------------------------------------------------------------------
// Known-binary extensions — never sent to the model
// ---------------------------------------------------------------------------

/**
 * Extensions for file types that are inherently binary / non-textual and
 * have no dedicated transformer. Files with these extensions are rejected
 * early with a placeholder message instead of falling through to the
 * text transformer, which could accidentally let binary content into
 * the model context.
 */
const KNOWN_BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  // Compiled / executable
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.o',
  '.a',
  '.lib',
  '.obj',
  '.class',
  '.pyc',
  '.pyo',
  '.pyd',
  '.wasm',

  // Media — audio
  '.mp3',
  '.wav',
  '.flac',
  '.ogg',
  '.aac',
  '.m4a',
  '.wma',
  '.opus',
  '.aif',
  '.aiff',
  '.mid',
  '.midi',

  // Media — video
  '.mp4',
  '.avi',
  '.mov',
  '.mkv',
  '.wmv',
  '.flv',
  '.webm',
  '.m4v',
  '.mpeg',
  '.mpg',
  '.3gp',

  // Fonts
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',

  // Office / document formats
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  '.rtf',

  // Database / data
  '.db',
  '.sqlite',
  '.sqlite3',
  '.mdb',
  '.accdb',
  '.parquet',
  '.feather',
  '.arrow',
  '.avro',

  // Serialised models / ML
  '.pkl',
  '.pickle',
  '.model',
  '.onnx',
  '.pb',
  '.pt',
  '.pth',
  '.h5',
  '.hdf5',
  '.safetensors',

  // Package / installer
  '.rpm',
  '.deb',
  '.apk',
  '.msi',
  '.pkg',
  '.snap',
  '.flatpak',
  '.appimage',

  // Native add-ons / misc binary
  '.node',
  '.bin',
  '.dat',
  '.elf',

  // Source maps (large, not useful as model context)
  '.map',
]);

/**
 * Compound extensions that need full-name matching because
 * `path.extname()` only returns the last segment (e.g. `.gz` for `.tar.gz`).
 */
const COMPOUND_EXT_TRANSFORMERS: {
  suffix: string;
  transformer: FileTransformer;
}[] = [{ suffix: '.tar.gz', transformer: archiveTransformer }];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options bag for `fileReadTransformer()`. */
export interface FileReadTransformerOptions {
  /** Mount-prefixed path (e.g. `"w1/src/app.tsx"`, `"att/abc123"`). */
  mountedPath: string;
  /** Expected SHA-256 content hash from `pathReferences`. */
  expectedHash: string;
  /** Reads a mount-prefixed path to a Buffer. */
  blobReader: BlobReader;
  /** File-read cache service. */
  cache: FileReadCacheService;
  /** Logger. */
  logger: Logger;
  /** Agent instance ID. */
  agentId: string;
  /** Map of mount prefix → absolute root path. */
  mountPaths: Map<string, string>;
  /**
   * Original file name for `att/` blobs (whose stored name is randomised).
   * Used for extension/language inference.
   */
  originalFileName?: string;
  /**
   * Optional read parameters controlling content slicing and preview.
   *
   * When set, transformers adapt their output (e.g. returning only a line
   * range for text files, a page range for PDFs, or a structural preview).
   * The parameters also become part of the cache key so that different
   * slices of the same file are cached independently.
   */
  readParams?: ReadParams;
  /**
   * Per-request character budget for a single file read.
   *
   * When omitted, falls back to the module-level default.
   */
  maxReadChars?: number;
  /**
   * Per-request maximum number of lines returned in preview mode.
   *
   * When omitted, falls back to the module-level default.
   */
  maxPreviewLines?: number;
}

/**
 * The return value of `fileReadTransformer()`.
 *
 * Consumers splice `parts` directly into the model message content array.
 * The first part is always a `TextPart` containing the `<file>` opening
 * XML tag + `<metadata>` + `<content>` opener. The last part is always
 * a `TextPart` with the `</content></file>` closer. In between, the
 * transformer may inject additional parts (e.g. `ImagePart` for images).
 */
export interface FileReadTransformerResult {
  parts: (TextPart | ImagePart | FilePart)[];

  /**
   * The read parameters describing what the transformer **actually
   * delivered**. Falls back to the requested `readParams` when the
   * transformer did not report truncation.
   *
   * Used by the XML envelope (`truncated="true"` attribute) to inform
   * the model when the full requested range was not delivered.
   */
  effectiveReadParams?: ReadParams;
}

/**
 * Transform a file into model-ready parts wrapped in `<file>` XML.
 *
 * This is the **single entry point** for all file content injection.
 */
export async function fileReadTransformer(
  opts: FileReadTransformerOptions,
): Promise<FileReadTransformerResult> {
  const {
    mountedPath,
    expectedHash,
    blobReader,
    cache,
    logger,
    agentId,
    mountPaths,
    originalFileName,
    readParams,
    maxReadChars = getMaxReadChars() || DEFAULT_MAX_READ_CHARS,
    maxPreviewLines = getMaxPreviewLines() || DEFAULT_MAX_PREVIEW_LINES,
  } = opts;

  // Normalise readParams — strip undefined values so an empty object
  // and a missing value produce the same cache key.
  const effectiveReadParams: ReadParams = readParams ?? {};

  // ── 1. Resolve to absolute path + stat ──────────────────────────────
  const absolutePath = resolveMountedPath(mountedPath, agentId, mountPaths);
  if (!absolutePath) {
    return wrapError(
      mountedPath,
      'Path could not be resolved.',
      effectiveReadParams,
    );
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(absolutePath);
  } catch {
    return wrapError(
      mountedPath,
      'File or directory does not exist.',
      effectiveReadParams,
    );
  }

  const isDirectory = stat.isDirectory();

  // ── 2. Read contents + compute current hash ─────────────────────────
  let buf: Buffer;
  let currentHash: string;

  if (isDirectory) {
    buf = Buffer.alloc(0);
    try {
      currentHash = await hashDirectory(absolutePath);
    } catch {
      return wrapError(
        mountedPath,
        'Directory could not be hashed.',
        effectiveReadParams,
      );
    }
  } else {
    try {
      buf = await blobReader(agentId, mountedPath);
    } catch {
      return wrapError(
        mountedPath,
        'File could not be read.',
        effectiveReadParams,
      );
    }
    currentHash = hashBuffer(buf);
  }

  // ── 3. Build cache key ─────────────────────────────────────────────
  // The cache key includes the file extension so that files with identical
  // content but different extensions (e.g. foo.ts vs bar.py) get separate
  // cache entries — their metadata (language, format) differs.
  const nameForExt = originalFileName ?? mountedPath;
  const ext = isDirectory ? '' : nodePath.extname(nameForExt).toLowerCase();
  const readParamsSuffix = buildReadParamsSuffix(
    effectiveReadParams,
    maxReadChars,
    maxPreviewLines,
  );
  const currentCacheKey = FileReadCacheService.buildCacheKey(
    currentHash,
    ext,
    readParamsSuffix,
  );
  const expectedCacheKey = FileReadCacheService.buildCacheKey(
    expectedHash,
    ext,
    readParamsSuffix,
  );

  // ── 4. Hash comparison + cache lookup ───────────────────────────────
  const hashMatches = currentHash === expectedHash;

  if (hashMatches) {
    // 4a. Hash matches — try cache first.
    try {
      const cached = await cache.get(currentCacheKey);
      if (cached) {
        const deserialized = deserializeTransformResult(cached.content);
        if (deserialized) {
          logger.debug(
            `[fileReadTransformer] Cache hit for ${mountedPath} (hash match)`,
          );
          return wrapResult(mountedPath, deserialized, effectiveReadParams);
        }
      }
    } catch (e: unknown) {
      logger.warn(
        `[fileReadTransformer] Cache read failed for ${mountedPath}, treating as miss`,
        e,
      );
    }

    // Cache miss — run transformer.
    const result = await runTransformer(
      buf,
      mountedPath,
      stat,
      isDirectory,
      {
        agentId,
        mountPaths,
        cache,
        logger,
        readParams: effectiveReadParams,
        maxReadChars,
        maxPreviewLines,
      },
      originalFileName,
    );

    // Store in cache (fire-and-forget).
    cache
      .set(currentCacheKey, serializeTransformResult(result), stat.size)
      .catch((e: unknown) => {
        logger.warn('[fileReadTransformer] Cache write failed', e);
      });

    return wrapResult(mountedPath, result, effectiveReadParams);
  }

  // 4b. Hash mismatch — file changed since pathReferences were recorded.
  //     Check cache for the *expected* hash (we may still have the old version).
  try {
    const cachedOld = await cache.get(expectedCacheKey);
    if (cachedOld) {
      const deserialized = deserializeTransformResult(cachedOld.content);
      if (deserialized) {
        logger.debug(
          `[fileReadTransformer] Cache hit for ${mountedPath} (old hash, file changed)`,
        );
        return wrapResult(mountedPath, deserialized, effectiveReadParams);
      }
    }
  } catch (e: unknown) {
    logger.warn(
      `[fileReadTransformer] Cache read failed for ${mountedPath} (old hash), treating as miss`,
      e,
    );
  }

  // No cached old version — return a version-unavailable fallback.
  logger.debug(
    `[fileReadTransformer] Hash mismatch for ${mountedPath}, no cache — fallback`,
  );
  return wrapError(
    mountedPath,
    'File has changed since it was read. The original version is no longer available.',
    effectiveReadParams,
  );
}

// ---------------------------------------------------------------------------
// Internal: run the appropriate transformer
// ---------------------------------------------------------------------------

async function runTransformer(
  buf: Buffer,
  mountedPath: string,
  stat: Awaited<ReturnType<typeof fs.stat>>,
  isDirectory: boolean,
  ctx: TransformerContext,
  originalFileName?: string,
): Promise<FileTransformResult> {
  const stats = {
    size: Number(stat.size),
    mtime: stat.mtime,
    isDirectory,
  };

  if (isDirectory) {
    return directoryTransformer(buf, mountedPath, stats, ctx, originalFileName);
  }

  // Determine extension → look up transformer, fall back to text.
  const nameForExt = originalFileName ?? mountedPath;
  const nameLower = nameForExt.toLowerCase();
  const ext = nodePath.extname(nameForExt).toLowerCase();

  // Check compound extensions first (e.g. `.tar.gz`).
  let transformer: FileTransformer | undefined;
  for (const { suffix, transformer: t } of COMPOUND_EXT_TRANSFORMERS) {
    if (nameLower.endsWith(suffix)) {
      transformer = t;
      break;
    }
  }

  // Block known-binary extensions that have no dedicated transformer.
  if (!transformer && KNOWN_BINARY_EXTENSIONS.has(ext)) {
    return {
      metadata: {
        ...baseMetadata(stats.size, stats.mtime),
        format: 'binary',
      },
      parts: [
        {
          type: 'text' as const,
          text: `Unsupported binary file (${ext}). Use fs.readFile('${mountedPath}') in the sandbox to access raw bytes.`,
        },
      ],
    };
  }

  transformer ??= TRANSFORMER_BY_EXT[ext] ?? textTransformer;
  return transformer(buf, mountedPath, stats, ctx, originalFileName);
}

// ---------------------------------------------------------------------------
// XML wrapping
// ---------------------------------------------------------------------------

/**
 * Wrap a `FileTransformResult` in an XML envelope.
 *
 * Directories use `<dir>`, files use `<file>`:
 * ```xml
 * <file path="w1/src/app.tsx">
 *   <metadata>size:4.2KB|modified:2025-03-23T20:50:00Z|language:typescript</metadata>
 *   <content>
 *     [... transformer parts ...]
 *   </content>
 * </file>
 * ```
 *
 * When the result represents a preview, the inner tag is `<preview>`
 * instead of `<content>` so the model can distinguish structural
 * summaries from actual file content.
 *
 * The opening/closing XML tags are text parts. Transformer parts are spliced
 * in between.
 */
function wrapResult(
  mountedPath: string,
  result: FileTransformResult,
  requestedParams?: ReadParams,
): FileReadTransformerResult {
  // Use <dir> for directories, <file> for everything else.
  const tag = result.metadata.type === 'directory' ? 'dir' : 'file';

  const metadataStr = Object.entries(result.metadata)
    .map(([k, v]) => `${k}:${v}`)
    .join('|');

  // Use the transformer's effective params (what was actually delivered)
  // for XML attributes. Falls back to the requested params when the
  // transformer did not report truncation.
  const delivered = result.effectiveReadParams ?? requestedParams;

  // Detect whether the transformer truncated the output relative to
  // what was requested. When true, the `<file>` tag gets a
  // `truncated="true"` attribute so the model knows the full requested
  // range was NOT delivered.
  const wasTruncated =
    delivered !== undefined &&
    requestedParams !== undefined &&
    result.effectiveReadParams !== undefined &&
    !readParamsEqual(requestedParams, result.effectiveReadParams);

  // Include read-param attributes on <file> tags only (not <dir>).
  // These reflect what was *actually delivered*, not what was requested.
  let readParamAttrs = '';
  if (tag === 'file' && delivered) {
    if (delivered.startLine !== undefined)
      readParamAttrs += ` startLine="${delivered.startLine}"`;
    if (delivered.endLine !== undefined)
      readParamAttrs += ` endLine="${delivered.endLine}"`;
    if (delivered.startPage !== undefined)
      readParamAttrs += ` startPage="${delivered.startPage}"`;
    if (delivered.endPage !== undefined)
      readParamAttrs += ` endPage="${delivered.endPage}"`;
    if (delivered.preview) readParamAttrs += ' preview="true"';
    if (delivered.depth !== undefined)
      readParamAttrs += ` depth="${delivered.depth}"`;
    if (wasTruncated) readParamAttrs += ' truncated="true"';
  }

  // Use <preview> instead of <content> when the result is a preview,
  // so the model can distinguish structural summaries from file content.
  const innerTag = delivered?.preview ? 'preview' : 'content';

  const openXml =
    `<${tag} path="${escapeXmlAttr(mountedPath)}"${readParamAttrs}>\n` +
    `<metadata>${metadataStr}</metadata>\n` +
    `<${innerTag}>\n`;
  const closeXml = `\n</${innerTag}>\n</${tag}>`;

  const parts: (TextPart | ImagePart | FilePart)[] = [];

  // Opening tag. If the first transformer part is text, merge with it
  // to reduce part count.
  if (result.parts.length > 0 && result.parts[0].type === 'text') {
    parts.push({
      type: 'text',
      text: openXml + result.parts[0].text,
    });
    // Middle parts (if any) — shallow-copy each part to avoid mutating
    // objects owned by the caller (e.g. deserialized cache entries).
    for (let i = 1; i < result.parts.length; i++) {
      parts.push({ ...result.parts[i] });
    }
  } else {
    parts.push({ type: 'text', text: openXml });
    for (const part of result.parts) {
      parts.push({ ...part });
    }
  }

  // Closing tag. If the last part in `parts` is text, merge.
  // Safe to mutate because every part above is a fresh copy.
  const lastIdx = parts.length - 1;
  if (lastIdx >= 0 && parts[lastIdx].type === 'text') {
    (parts[lastIdx] as TextPart).text += closeXml;
  } else {
    parts.push({ type: 'text', text: closeXml });
  }

  return { parts, effectiveReadParams: result.effectiveReadParams };
}

/**
 * Wrap an error message in a `<file>` XML envelope.
 *
 * Errors always use `<file>` since we don't know the type when resolution
 * or reading fails.
 */
function wrapError(
  mountedPath: string,
  error: string,
  readParams?: ReadParams,
): FileReadTransformerResult {
  return wrapResult(
    mountedPath,
    {
      metadata: { error: 'true' },
      parts: [{ type: 'text', text: error }],
    },
    readParams,
  );
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Shallow equality check for two `ReadParams` objects.
 * Returns `true` when all fields are identical.
 */
function readParamsEqual(a: ReadParams, b: ReadParams): boolean {
  return (
    a.startLine === b.startLine &&
    a.endLine === b.endLine &&
    a.startPage === b.startPage &&
    a.endPage === b.endPage &&
    (a.preview ?? false) === (b.preview ?? false) &&
    a.depth === b.depth
  );
}

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build a deterministic suffix string from `ReadParams` for use in cache
 * keys. Returns an empty string when no params are set, so callers
 * without read params get the same cache key as before.
 *
 * Segments are emitted in fixed order: sl, el, sp, ep, pv, d.
 * Only non-undefined keys are included.
 *
 * Example: `sl=1,el=50,d=3`
 */
function buildReadParamsSuffix(
  params: ReadParams,
  maxReadChars: number,
  maxPreviewLines: number,
): string {
  const parts: string[] = [];
  if (params.startLine !== undefined) parts.push(`sl=${params.startLine}`);
  if (params.endLine !== undefined) parts.push(`el=${params.endLine}`);
  if (params.startPage !== undefined) parts.push(`sp=${params.startPage}`);
  if (params.endPage !== undefined) parts.push(`ep=${params.endPage}`);
  if (params.preview) parts.push('pv=1');
  if (params.depth !== undefined) parts.push(`d=${params.depth}`);

  // Include the runtime content-limit settings so that changing them
  // invalidates cached results (the same read params can produce
  // different output when the cap is different).
  parts.push(`mrc=${maxReadChars}`);
  if (params.preview) parts.push(`mpl=${maxPreviewLines}`);

  return parts.join(',');
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  FileTransformResult,
  FileTransformer,
  TransformerContext,
  ReadParams,
} from './types';
export {
  serializeTransformResult,
  deserializeTransformResult,
} from './serialization';
export { SeenFilesTracker } from './coverage';
