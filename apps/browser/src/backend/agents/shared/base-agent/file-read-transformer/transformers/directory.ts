/**
 * Directory transformer.
 *
 * Lists directory contents up to 3 levels deep (root + 2 child levels)
 * and returns a formatted text tree as a `TextPart`.
 *
 * Per-depth entry limits default to [20, 10, 5] (top → grandchildren).
 * Uses the generic `formatDirectoryTree()` utility for rendering.
 */

import fs from 'node:fs/promises';
import nodePath from 'node:path';
import type {
  FileTransformer,
  FileTransformResult,
  ReadParams,
} from '../types';
import { resolveMountedPath } from '../resolve-path';
import { baseMetadata } from '../format-utils';
import { formatDirectoryTree, type TreeEntry } from '../format-directory-tree';

/** Default depth to list (0 = direct children only, 2 = great-grandchildren). */
const DEFAULT_DEPTH = 2;

/** Maximum total entries to include before truncation. */
const MAX_ENTRIES = 200;

export const directoryTransformer: FileTransformer = async (
  _buf,
  mountedPath,
  stats,
  ctx,
): Promise<FileTransformResult> => {
  const metadata: Record<string, string> = {
    ...baseMetadata(0, stats.mtime),
    type: 'directory',
  };
  // Override size — directories don't have a meaningful byte size.
  metadata.size = '—';

  const absolutePath = resolveMountedPath(
    mountedPath,
    ctx.agentId,
    ctx.mountPaths,
  );
  if (!absolutePath) {
    return {
      metadata,
      parts: [
        {
          type: 'text',
          text: `Directory path could not be resolved.`,
        },
      ],
    };
  }

  try {
    const { preview } = ctx.readParams;

    // ── Preview mode ───────────────────────────────────────────
    // Shallow listing (depth 0 = direct children only).
    if (preview) {
      const previewDepth = 0;
      const entries = await buildTreeEntries(absolutePath, 0, previewDepth);
      const result = formatDirectoryTree(entries, {
        maxTotalEntries: MAX_ENTRIES,
        maxDepth: previewDepth,
      });

      metadata.entries = String(result.totalEntries);
      metadata.depth = '1';
      metadata.preview = 'true';

      let tree = result.text;
      if (result.truncated) {
        tree += `\n... (truncated at ${MAX_ENTRIES} entries)`;
      }

      const effectiveReadParams: ReadParams = {
        preview: true,
        depth: previewDepth,
      };

      return {
        metadata,
        parts: [{ type: 'text', text: tree }],
        effectiveReadParams,
      };
    }

    // ── Full / depth-controlled mode ───────────────────────────
    const maxDepth = ctx.readParams.depth ?? DEFAULT_DEPTH;
    const entries = await buildTreeEntries(absolutePath, 0, maxDepth);
    const result = formatDirectoryTree(entries, {
      maxTotalEntries: MAX_ENTRIES,
      maxDepth: maxDepth,
    });

    metadata.entries = String(result.totalEntries);
    metadata.depth = String(maxDepth + 1);

    let tree = result.text;
    if (result.truncated) {
      tree += `\n... (truncated at ${MAX_ENTRIES} entries)`;
    }

    return {
      metadata,
      parts: [{ type: 'text', text: tree }],
    };
  } catch (err) {
    ctx.logger.warn(
      `[directoryTransformer] Failed to list ${mountedPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      metadata,
      parts: [
        {
          type: 'text',
          text: `Directory listing for ${mountedPath}. Use the read tool for detailed contents.`,
        },
      ],
    };
  }
};

// ---------------------------------------------------------------------------
// Recursive fs → TreeEntry builder
// ---------------------------------------------------------------------------

/**
 * Recursively reads the filesystem at `dirPath` and produces a flat array
 * of `TreeEntry` nodes (with nested `children` for directories), up to
 * `maxDepth` levels deep.
 */
async function buildTreeEntries(
  dirPath: string,
  depth: number,
  maxDepth: number = DEFAULT_DEPTH,
): Promise<TreeEntry[]> {
  let dirents: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    dirents = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    // Permission denied or similar — return empty.
    return [];
  }

  const entries: TreeEntry[] = [];

  for (const dirent of dirents) {
    const isDir = dirent.isDirectory();
    const entry: TreeEntry = {
      name: dirent.name,
      isDirectory: isDir,
    };

    if (isDir && depth < maxDepth) {
      entry.children = await buildTreeEntries(
        nodePath.join(dirPath, dirent.name),
        depth + 1,
        maxDepth,
      );
    }

    entries.push(entry);
  }

  return entries;
}
