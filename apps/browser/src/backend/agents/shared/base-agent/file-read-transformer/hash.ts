/**
 * Content hashing utilities for the file attachment pipeline.
 *
 * Provides SHA-256 hashing for:
 * - **Files**: Hash of raw file contents.
 * - **Directories**: Hash of a stat-based representation of entries at
 *   depth ≤ 1 (direct children + grandchildren). Uses file names and sizes
 *   — no file content reads or mtime — for performance and stability.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import nodePath from 'node:path';

// ---------------------------------------------------------------------------
// File hashing
// ---------------------------------------------------------------------------

/**
 * Compute the SHA-256 hex digest of a buffer.
 */
export function hashBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Read a file and return its SHA-256 hex digest.
 *
 * @param absolutePath — Fully resolved filesystem path.
 * @throws If the file cannot be read.
 */
export async function hashFile(absolutePath: string): Promise<string> {
  const buf = await fs.readFile(absolutePath);
  return hashBuffer(buf);
}

// ---------------------------------------------------------------------------
// Directory hashing
// ---------------------------------------------------------------------------

interface DirEntry {
  /** Path relative to the hashed directory root */
  relativePath: string;
  /** File size in bytes, or `'d'` for directories */
  size: number | 'd';
}

/**
 * Recursively collect directory entries up to `maxDepth` levels deep.
 *
 * @param basePath — Absolute path to the directory root.
 * @param currentRelative — Current relative path from basePath (empty string for root).
 * @param currentDepth — Current recursion depth (0 = direct children of basePath).
 * @param maxDepth — Maximum depth to recurse into (inclusive).
 */
async function collectEntries(
  basePath: string,
  currentRelative: string,
  currentDepth: number,
  maxDepth: number,
): Promise<DirEntry[]> {
  const dirPath = currentRelative
    ? nodePath.join(basePath, currentRelative)
    : basePath;

  let dirents: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    dirents = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    // Directory unreadable (permissions, deleted, etc.) — skip silently.
    return [];
  }

  const entries: DirEntry[] = [];

  for (const dirent of dirents) {
    const entryRelative = currentRelative
      ? `${currentRelative}/${dirent.name}`
      : dirent.name;

    // Include ALL entries — dotfiles, dotfolders, node_modules.
    // Must stay consistent with the directory transformer listing
    // which also includes everything. The MAX_ENTRIES cap in the
    // listing transformer prevents runaway output.

    let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;
    try {
      stat = await fs.stat(nodePath.join(basePath, entryRelative));
    } catch {
      // Entry vanished or unreadable — skip.
      continue;
    }

    entries.push({
      relativePath: entryRelative,
      size: dirent.isDirectory() ? 'd' : stat.size,
    });

    // Recurse into subdirectories if within depth limit
    if (dirent.isDirectory() && currentDepth < maxDepth) {
      const subEntries = await collectEntries(
        basePath,
        entryRelative,
        currentDepth + 1,
        maxDepth,
      );
      entries.push(...subEntries);
    }
  }

  return entries;
}

/**
 * Compute a SHA-256 hash representing the state of a directory's top two
 * levels (depth 0 = direct children, depth 1 = grandchildren).
 *
 * The hash is based on sorted `relativePath:size` lines for each entry.
 * It changes when files are added, removed, renamed, or resized — but NOT
 * on mtime-only changes (e.g. `git checkout`, `touch`, backup restore).
 * This avoids spurious cache invalidations. The trade-off is that a file
 * rewritten with identical size won't invalidate the directory hash, but
 * this is acceptable since the directory listing only shows names and
 * structure, not file contents.
 *
 * All entries are included (dotfiles, dotfolders, node_modules) — consistent
 * with the directory transformer's listing logic.
 *
 * @param absolutePath — Fully resolved filesystem path to the directory.
 * @throws If the directory cannot be read.
 */
export async function hashDirectory(absolutePath: string): Promise<string> {
  const entries = await collectEntries(absolutePath, '', 0, 1);

  // Sort deterministically by relative path for stable hash
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const hashInput = entries
    .map((e) => `${e.relativePath}:${e.size}`)
    .join('\n');

  return createHash('sha256').update(hashInput).digest('hex');
}

// ---------------------------------------------------------------------------
// Unified path hashing
// ---------------------------------------------------------------------------

/**
 * Compute the content hash for a given absolute path, auto-detecting whether
 * it is a file or directory.
 *
 * @param absolutePath — Fully resolved filesystem path.
 * @returns The SHA-256 hex digest.
 * @throws If the path does not exist or cannot be read.
 */
export async function hashPath(absolutePath: string): Promise<string> {
  const stat = await fs.stat(absolutePath);
  if (stat.isDirectory()) {
    return hashDirectory(absolutePath);
  }
  return hashFile(absolutePath);
}
