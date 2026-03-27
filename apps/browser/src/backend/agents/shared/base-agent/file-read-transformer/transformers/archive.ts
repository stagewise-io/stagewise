/**
 * Archive transformer.
 *
 * Extracts file listings from archive files (ZIP, TAR, TAR.GZ, TGZ)
 * and renders them as a directory tree using the shared
 * `formatDirectoryTree()` utility.
 *
 * No file contents are extracted — only the listing of paths, sizes,
 * and directory structure. This keeps context-window usage minimal
 * while giving the LLM full visibility into the archive layout.
 */

import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import type {
  FileTransformer,
  FileTransformResult,
  ReadParams,
} from '../types';
import { baseMetadata, formatBytes } from '../format-utils';
import { formatDirectoryTree, type TreeEntry } from '../format-directory-tree';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Maximum entries to process from the archive listing. */
const MAX_ENTRIES = 2000;

/** Default depth for the rendered tree. */
const DEFAULT_DEPTH = 4;

// ---------------------------------------------------------------------------
// ZIP extraction (via yauzl)
// ---------------------------------------------------------------------------

interface ArchiveEntry {
  /** Full path within the archive (e.g. `"src/index.ts"`). */
  path: string;
  /** Whether this entry is a directory. */
  isDirectory: boolean;
  /** Uncompressed size in bytes (0 for directories). */
  size: number;
}

/**
 * List all entries in a ZIP buffer using yauzl.
 */
function listZipEntries(buf: Buffer): Promise<ArchiveEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error('Failed to open ZIP'));
        return;
      }

      const entries: ArchiveEntry[] = [];
      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        const isDir = entry.fileName.endsWith('/');
        entries.push({
          path: entry.fileName,
          isDirectory: isDir,
          size: isDir ? 0 : entry.uncompressedSize,
        });

        if (entries.length >= MAX_ENTRIES) {
          zipfile.close();
          resolve(entries);
          return;
        }

        zipfile.readEntry();
      });

      zipfile.on('end', () => resolve(entries));
      zipfile.on('error', reject);
    });
  });
}

// ---------------------------------------------------------------------------
// TAR extraction (manual header parsing, no external dependency)
// ---------------------------------------------------------------------------

/**
 * Parse tar archive entries from a raw (uncompressed) tar buffer.
 *
 * Tar format: 512-byte header blocks followed by data blocks.
 * We only read the headers to extract file names and sizes.
 */
function listTarEntries(buf: Buffer): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let offset = 0;

  while (offset + 512 <= buf.length && entries.length < MAX_ENTRIES) {
    const header = buf.subarray(offset, offset + 512);

    // End-of-archive: two consecutive 512-byte blocks of zeros.
    if (header.every((b) => b === 0)) break;

    // File name: bytes 0–99 (null-terminated).
    const nameRaw = header.subarray(0, 100);
    const nameEnd = nameRaw.indexOf(0);
    let name = nameRaw
      .subarray(0, nameEnd === -1 ? 100 : nameEnd)
      .toString('utf-8');

    // Prefix: bytes 345–499 (POSIX/ustar).
    const prefix = header.subarray(345, 500);
    const prefixEnd = prefix.indexOf(0);
    const prefixStr = prefix
      .subarray(0, prefixEnd === -1 ? 155 : prefixEnd)
      .toString('utf-8');
    if (prefixStr) {
      name = `${prefixStr}/${name}`;
    }

    // Size: bytes 124–135 (octal, null/space terminated).
    const sizeStr = header.subarray(124, 136).toString('utf-8').trim();
    const size = Number.parseInt(sizeStr, 8) || 0;

    // Type flag: byte 156.
    const typeFlag = header[156];

    // '5' = directory, '0' or '\0' = regular file, 'L'/'K' = GNU long name.
    const isDirectory = typeFlag === 53 /* '5' */ || name.endsWith('/');

    // Skip special entries (GNU long name, pax headers, etc.) but still
    // advance past their data.
    const isRegularOrDir =
      typeFlag === 0 ||
      typeFlag === 48 /* '0' */ ||
      typeFlag === 53 /* '5' */ ||
      typeFlag === 50 /* '2' symlink */;

    if (isRegularOrDir && name) {
      entries.push({ path: name, isDirectory, size });
    }

    // Advance past header + data blocks (data rounded up to 512).
    const dataBlocks = Math.ceil(size / 512);
    offset += 512 + dataBlocks * 512;
  }

  return entries;
}

/**
 * Decompress a gzipped buffer.
 */
function gunzipBuffer(buf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();
    const stream = Readable.from(buf);

    stream
      .pipe(gunzip)
      .on('data', (chunk: Buffer) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Convert flat archive entries → nested TreeEntry[]
// ---------------------------------------------------------------------------

function archiveEntriesToTree(entries: ArchiveEntry[]): TreeEntry[] {
  // Build a nested map keyed by path segments.
  interface TreeNode {
    entry?: ArchiveEntry;
    children: Map<string, TreeNode>;
  }

  const root: TreeNode = { children: new Map() };

  for (const entry of entries) {
    // Normalize: strip trailing slash, split into segments.
    const cleanPath = entry.path.replace(/\/+$/, '');
    if (!cleanPath) continue;

    const segments = cleanPath.split('/');
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!current.children.has(seg)) {
        current.children.set(seg, { children: new Map() });
      }
      current = current.children.get(seg)!;

      // Tag the final segment with the entry info.
      if (i === segments.length - 1) {
        current.entry = entry;
      }
    }
  }

  // Convert the nested map into TreeEntry[].
  function toTreeEntries(node: TreeNode): TreeEntry[] {
    const result: TreeEntry[] = [];
    for (const [name, child] of node.children) {
      const isDir = child.entry?.isDirectory ?? child.children.size > 0;
      const treeEntry: TreeEntry = {
        name,
        isDirectory: isDir,
        metadata: isDir
          ? undefined
          : { size: formatBytes(child.entry?.size ?? 0) },
      };
      if (child.children.size > 0) {
        treeEntry.children = toTreeEntries(child);
      }
      result.push(treeEntry);
    }
    return result;
  }

  return toTreeEntries(root);
}

// ---------------------------------------------------------------------------
// Detect archive type from extension
// ---------------------------------------------------------------------------

export type ArchiveType = 'zip' | 'tar' | 'tar.gz';

export function detectArchiveType(
  ext: string,
  fileName?: string,
): ArchiveType | null {
  const lower = ext.toLowerCase();
  if (lower === '.zip' || lower === '.jar' || lower === '.war') return 'zip';
  if (lower === '.tar') return 'tar';
  if (lower === '.tgz') return 'tar.gz';
  if (lower === '.gz' && fileName?.toLowerCase().endsWith('.tar.gz'))
    return 'tar.gz';
  return null;
}

// ---------------------------------------------------------------------------
// Main transformer
// ---------------------------------------------------------------------------

export const archiveTransformer: FileTransformer = async (
  buf,
  mountedPath,
  stats,
  ctx,
  originalFileName,
): Promise<FileTransformResult> => {
  const nameForExt = originalFileName ?? mountedPath;
  const ext = nameForExt.includes('.')
    ? `.${nameForExt.split('.').pop()!}`
    : '';
  const archiveType = detectArchiveType(ext, nameForExt);

  const metadata: Record<string, string> = {
    ...baseMetadata(stats.size, stats.mtime),
    format: archiveType ?? 'archive',
  };

  if (buf.length === 0) {
    return {
      metadata: { ...metadata, error: 'empty' },
      parts: [{ type: 'text', text: 'Empty archive file.' }],
    };
  }

  try {
    let entries: ArchiveEntry[];

    if (archiveType === 'zip') {
      entries = await listZipEntries(buf);
    } else if (archiveType === 'tar.gz') {
      const tarBuf = await gunzipBuffer(buf);
      entries = listTarEntries(tarBuf);
    } else if (archiveType === 'tar') {
      entries = listTarEntries(buf);
    } else {
      // Fallback: try zip first, then tar.
      try {
        entries = await listZipEntries(buf);
      } catch {
        entries = listTarEntries(buf);
      }
    }

    const fileCount = entries.filter((e) => !e.isDirectory).length;
    const dirCount = entries.filter((e) => e.isDirectory).length;
    const totalUncompressed = entries.reduce((s, e) => s + e.size, 0);

    metadata.files = String(fileCount);
    metadata.directories = String(dirCount);
    metadata.totalEntries = String(entries.length);
    metadata.uncompressedSize = formatBytes(totalUncompressed);

    if (entries.length >= MAX_ENTRIES) {
      metadata.truncated = `${MAX_ENTRIES}+ entries`;
    }

    const { preview } = ctx.readParams;

    // ── Preview mode ──────────────────────────────────────────────
    // Shallow tree (depth 0 = top-level entries only).
    if (preview) {
      metadata.preview = 'true';
      const previewDepth = 0;
      const tree = archiveEntriesToTree(entries);
      const result = formatDirectoryTree(tree, {
        maxTotalEntries: 500,
        maxDepth: previewDepth,
        metadataKeys: ['size'],
      });

      let text = result.text;
      if (result.truncated) {
        text += `\n… (tree truncated at 500 displayed entries)`;
      }

      const effectiveReadParams: ReadParams = {
        preview: true,
        depth: previewDepth,
      };

      return {
        metadata,
        parts: [{ type: 'text', text }],
        effectiveReadParams,
      };
    }

    // ── Full / depth-controlled mode ──────────────────────────────
    const maxDepth = ctx.readParams.depth ?? DEFAULT_DEPTH;
    const tree = archiveEntriesToTree(entries);
    const result = formatDirectoryTree(tree, {
      maxTotalEntries: 500,
      maxDepth: maxDepth,
      metadataKeys: ['size'],
    });

    let text = result.text;
    if (result.truncated) {
      text += `\n… (tree truncated at 500 displayed entries)`;
    }

    return {
      metadata,
      parts: [{ type: 'text', text }],
    };
  } catch (err) {
    ctx.logger.warn(
      `[archiveTransformer] Failed to process ${mountedPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      metadata: { ...metadata, error: 'parse-failed' },
      parts: [
        {
          type: 'text',
          text: `Archive could not be parsed. Use fs.readFile('${mountedPath}') in the sandbox to access raw bytes.`,
        },
      ],
    };
  }
};
