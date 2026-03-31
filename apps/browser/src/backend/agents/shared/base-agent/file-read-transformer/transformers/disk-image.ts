/**
 * Disk image transformer.
 *
 * Handles ISO 9660 images (`.iso`) and raw disk images (`.img`).
 * For ISO files, parses the Primary Volume Descriptor and root directory
 * record to list the file tree. For `.img` files, attempts ISO 9660
 * detection and falls back to metadata-only output.
 *
 * On macOS, also supports `.dmg` files by mounting them temporarily
 * via `hdiutil` to list their contents.
 *
 * Uses the shared `formatDirectoryTree()` utility for rendering.
 */

import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  FileTransformer,
  FileTransformResult,
  TransformerContext,
  ReadParams,
} from '../types';
import { baseMetadata, formatBytes } from '../format-utils';
import { formatDirectoryTree, type TreeEntry } from '../format-directory-tree';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

const DEFAULT_DEPTH = 4;
const MAX_TOTAL_ENTRIES = 500;

// ---------------------------------------------------------------------------
// ISO 9660 parser
// ---------------------------------------------------------------------------

/**
 * Attempt to parse an ISO 9660 filesystem from a buffer.
 * Returns the volume label and a flat list of directory entries.
 */
function parseIso9660(buf: Buffer): {
  volumeId: string;
  entries: IsoEntry[];
} | null {
  // The Primary Volume Descriptor (PVD) starts at sector 16 (byte 32768).
  // Each sector is 2048 bytes.
  const SECTOR_SIZE = 2048;
  const PVD_OFFSET = 16 * SECTOR_SIZE;

  if (buf.length < PVD_OFFSET + SECTOR_SIZE) return null;

  // Check for volume descriptor type 1 (PVD) and "CD001" identifier.
  const vdType = buf[PVD_OFFSET];
  const cd001 = buf.subarray(PVD_OFFSET + 1, PVD_OFFSET + 6).toString('ascii');
  if (vdType !== 1 || cd001 !== 'CD001') return null;

  // Volume identifier: bytes 40–71 of PVD (32 bytes, space-padded).
  const volumeId = buf
    .subarray(PVD_OFFSET + 40, PVD_OFFSET + 72)
    .toString('ascii')
    .trim();

  // Root directory record: starts at byte 156 of PVD, 34 bytes.
  const rootRecordOffset = PVD_OFFSET + 156;
  const rootEntry = parseDirectoryRecord(buf, rootRecordOffset);
  if (!rootEntry) return null;

  // Read root directory extent.
  const entries: IsoEntry[] = [];
  readDirectoryExtent(
    buf,
    rootEntry.extentLBA,
    rootEntry.dataLength,
    '',
    entries,
    0,
  );

  return { volumeId, entries };
}

interface IsoEntry {
  path: string;
  isDirectory: boolean;
  size: number;
}

interface DirRecord {
  length: number;
  extentLBA: number;
  dataLength: number;
  name: string;
  isDirectory: boolean;
}

function parseDirectoryRecord(buf: Buffer, offset: number): DirRecord | null {
  if (offset + 1 >= buf.length) return null;
  const len = buf[offset];
  if (len < 33 || offset + len > buf.length) return null;

  const SECTOR_SIZE = 2048;

  // Extent location (LBA) — little-endian at offset+2 (4 bytes).
  const extentLBA = buf.readUInt32LE(offset + 2);
  // Data length — little-endian at offset+10 (4 bytes).
  const dataLength = buf.readUInt32LE(offset + 10);
  // File flags — byte 25.
  const flags = buf[offset + 25];
  const isDirectory = (flags & 0x02) !== 0;
  // File identifier length — byte 32.
  const idLen = buf[offset + 32];
  // File identifier — bytes 33+.
  const rawName = buf
    .subarray(offset + 33, offset + 33 + idLen)
    .toString('ascii');

  // Skip "." and ".." entries (identifiers 0x00 and 0x01).
  if (idLen === 1 && (buf[offset + 33] === 0x00 || buf[offset + 33] === 0x01)) {
    return {
      length: len,
      extentLBA: extentLBA * SECTOR_SIZE <= buf.length ? extentLBA : 0,
      dataLength,
      name: '',
      isDirectory,
    };
  }

  // Strip version number (e.g. ";1") from filename.
  let name = rawName.split(';')[0].replace(/\.$/, '');
  if (!name) name = rawName;

  return {
    length: len,
    extentLBA,
    dataLength,
    name,
    isDirectory,
  };
}

function readDirectoryExtent(
  buf: Buffer,
  lba: number,
  dataLength: number,
  parentPath: string,
  entries: IsoEntry[],
  depth: number,
): void {
  const SECTOR_SIZE = 2048;
  const startByte = lba * SECTOR_SIZE;
  const endByte = startByte + dataLength;

  if (startByte >= buf.length || endByte > buf.length) return;
  if (entries.length >= MAX_TOTAL_ENTRIES) return;
  if (depth > DEFAULT_DEPTH + 1) return;

  let offset = startByte;

  while (offset < endByte && entries.length < MAX_TOTAL_ENTRIES) {
    // Records cannot span sector boundaries; check for padding.
    const remaining = SECTOR_SIZE - (offset % SECTOR_SIZE);
    if (buf[offset] === 0) {
      // Skip to next sector.
      offset += remaining;
      continue;
    }

    const record = parseDirectoryRecord(buf, offset);
    if (!record || record.length === 0) break;

    offset += record.length;

    // Skip "." and ".." (empty name after parsing).
    if (!record.name) continue;

    const fullPath = parentPath ? `${parentPath}/${record.name}` : record.name;

    entries.push({
      path: fullPath + (record.isDirectory ? '/' : ''),
      isDirectory: record.isDirectory,
      size: record.isDirectory ? 0 : record.dataLength,
    });

    // Recurse into subdirectories.
    if (record.isDirectory && depth < DEFAULT_DEPTH + 1) {
      readDirectoryExtent(
        buf,
        record.extentLBA,
        record.dataLength,
        fullPath,
        entries,
        depth + 1,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// ISO entry → TreeEntry conversion (reuse archive pattern)
// ---------------------------------------------------------------------------

function isoEntriesToTree(entries: IsoEntry[]): TreeEntry[] {
  interface TreeNode {
    entry?: IsoEntry;
    children: Map<string, TreeNode>;
  }

  const root: TreeNode = { children: new Map() };

  for (const entry of entries) {
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
      if (i === segments.length - 1) {
        current.entry = entry;
      }
    }
  }

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
// DMG support (macOS only via hdiutil)
// ---------------------------------------------------------------------------

async function listDmgContents(
  buf: Buffer,
  mountedPath: string,
  ctx: TransformerContext,
): Promise<{
  entries: TreeEntry[];
  totalFiles: number;
  totalDirs: number;
} | null> {
  if (process.platform !== 'darwin') return null;

  // Write buffer to a temp file for hdiutil.
  const { tmpdir } = await import('node:os');
  const { writeFile, unlink, rm } = await import('node:fs/promises');
  const { randomUUID } = await import('node:crypto');

  const tmpPath = join(tmpdir(), `stagewise-dmg-${randomUUID()}.dmg`);
  const mountPoint = join(tmpdir(), `stagewise-mount-${randomUUID()}`);

  try {
    await writeFile(tmpPath, buf);

    // Mount the DMG read-only, without UI, without auto-opening Finder.
    await execFileAsync(
      'hdiutil',
      [
        'attach',
        tmpPath,
        '-mountpoint',
        mountPoint,
        '-readonly',
        '-nobrowse',
        '-noverify',
        '-noautoopen',
      ],
      { timeout: 15_000 },
    );

    // List contents recursively.
    let totalFiles = 0;
    let totalDirs = 0;

    async function walk(dir: string, depth: number): Promise<TreeEntry[]> {
      if (
        depth > DEFAULT_DEPTH + 1 ||
        totalFiles + totalDirs >= MAX_TOTAL_ENTRIES
      ) {
        return [];
      }

      const items = await readdir(dir, { withFileTypes: true });
      const result: TreeEntry[] = [];

      for (const item of items) {
        if (totalFiles + totalDirs >= MAX_TOTAL_ENTRIES) break;

        const isDir = item.isDirectory();
        const entry: TreeEntry = {
          name: item.name,
          isDirectory: isDir,
        };

        if (isDir) {
          totalDirs++;
          if (depth < DEFAULT_DEPTH + 1) {
            entry.children = await walk(join(dir, item.name), depth + 1);
          }
        } else {
          totalFiles++;
          try {
            const s = await stat(join(dir, item.name));
            entry.metadata = { size: formatBytes(Number(s.size)) };
          } catch {
            // Skip stat errors.
          }
        }

        result.push(entry);
      }

      return result;
    }

    const rootEntries = await walk(mountPoint, 0);

    return { entries: rootEntries, totalFiles, totalDirs };
  } catch (err) {
    ctx.logger.warn(
      `[diskImageTransformer] DMG mount failed for ${mountedPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  } finally {
    // Always try to detach and clean up.
    try {
      await execFileAsync('hdiutil', ['detach', mountPoint, '-force'], {
        timeout: 10_000,
      });
    } catch {
      // Best effort.
    }
    try {
      await unlink(tmpPath);
    } catch {
      // Best effort.
    }
    try {
      await rm(mountPoint, { recursive: true, force: true });
    } catch {
      // Best effort.
    }
  }
}

// ---------------------------------------------------------------------------
// Main transformer
// ---------------------------------------------------------------------------

export const diskImageTransformer: FileTransformer = async (
  buf,
  mountedPath,
  stats,
  ctx,
  originalFileName,
): Promise<FileTransformResult> => {
  const nameForExt = originalFileName ?? mountedPath;
  const ext = nameForExt.split('.').pop()?.toLowerCase() ?? '';
  const isDmg = ext === 'dmg';

  const metadata: Record<string, string> = {
    ...baseMetadata(stats.size, stats.mtime),
    format: isDmg ? 'dmg' : ext === 'img' ? 'disk-image' : 'iso-9660',
  };

  if (buf.length === 0) {
    return {
      metadata: { ...metadata, error: 'empty' },
      parts: [{ type: 'text', text: 'Empty disk image file.' }],
    };
  }

  // ── DMG handling (macOS only) ────────────────────────────────────
  if (isDmg) {
    if (process.platform !== 'darwin') {
      return {
        metadata: { ...metadata, note: 'macOS-only format' },
        parts: [
          {
            type: 'text',
            text: `DMG file detected. Content listing is only available on macOS. Use fs.readFile('${mountedPath}') for raw access.`,
          },
        ],
      };
    }

    const dmgResult = await listDmgContents(buf, mountedPath, ctx);
    if (!dmgResult) {
      return {
        metadata: { ...metadata, error: 'mount-failed' },
        parts: [
          {
            type: 'text',
            text: `DMG could not be mounted. Use fs.readFile('${mountedPath}') for raw access.`,
          },
        ],
      };
    }

    metadata.files = String(dmgResult.totalFiles);
    metadata.directories = String(dmgResult.totalDirs);

    // ── Preview mode (DMG) ─────────────────────────────────────
    if (ctx.readParams.preview) {
      metadata.preview = 'true';
      const previewDepth = 0;
      const result = formatDirectoryTree(dmgResult.entries, {
        maxTotalEntries: MAX_TOTAL_ENTRIES,
        maxDepth: previewDepth,
        metadataKeys: ['size'],
      });

      let text = result.text;
      if (result.truncated) {
        text += '\n… (tree truncated)';
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

    const maxDepth = ctx.readParams.depth ?? DEFAULT_DEPTH;
    const result = formatDirectoryTree(dmgResult.entries, {
      maxTotalEntries: MAX_TOTAL_ENTRIES,
      maxDepth: maxDepth,
      metadataKeys: ['size'],
    });

    let text = result.text;
    if (result.truncated) {
      text += '\n… (tree truncated)';
    }

    return { metadata, parts: [{ type: 'text', text }] };
  }

  // ── ISO/IMG handling ─────────────────────────────────────────────
  const isoData = parseIso9660(buf);

  if (!isoData) {
    // Not a recognizable ISO 9660 image.
    return {
      metadata: { ...metadata, note: 'not-iso9660' },
      parts: [
        {
          type: 'text',
          text: `Disk image file (${formatBytes(stats.size)}). Format is not ISO 9660 or could not be parsed. Use fs.readFile('${mountedPath}') for raw access.`,
        },
      ],
    };
  }

  if (isoData.volumeId) {
    metadata.volumeId = isoData.volumeId;
  }

  const fileCount = isoData.entries.filter((e) => !e.isDirectory).length;
  const dirCount = isoData.entries.filter((e) => e.isDirectory).length;
  metadata.files = String(fileCount);
  metadata.directories = String(dirCount);
  metadata.totalEntries = String(isoData.entries.length);

  // ── Preview mode (ISO/IMG) ──────────────────────────────────
  if (ctx.readParams.preview) {
    metadata.preview = 'true';
    const previewDepth = 0;
    const tree = isoEntriesToTree(isoData.entries);
    const result = formatDirectoryTree(tree, {
      maxTotalEntries: MAX_TOTAL_ENTRIES,
      maxDepth: previewDepth,
      metadataKeys: ['size'],
    });

    let text = result.text;
    if (result.truncated) {
      text += '\n… (tree truncated)';
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

  const maxDepth = ctx.readParams.depth ?? DEFAULT_DEPTH;
  const tree = isoEntriesToTree(isoData.entries);
  const result = formatDirectoryTree(tree, {
    maxTotalEntries: MAX_TOTAL_ENTRIES,
    maxDepth: maxDepth,
    metadataKeys: ['size'],
  });

  let text = result.text;
  if (result.truncated) {
    text += '\n… (tree truncated)';
  }

  return { metadata, parts: [{ type: 'text', text }] };
};
