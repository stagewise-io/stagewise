import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if any of the given files exist in the project root
 */
export async function hasAnyFile(
  root: string,
  filenames: string[],
): Promise<boolean> {
  for (const filename of filenames)
    if (await fileExists(path.join(root, filename))) return true;

  return false;
}

/**
 * Find a binary in node_modules/.bin
 */
export async function findNodeModulesBin(
  root: string,
  binary: string,
): Promise<string | undefined> {
  const binPath = path.join(root, 'node_modules', '.bin', binary);
  if (await fileExists(binPath)) return binPath;

  return undefined;
}

/**
 * Check if a package is installed in node_modules
 */
export async function isPackageInstalled(
  root: string,
  packageName: string,
): Promise<boolean> {
  const packagePath = path.join(root, 'node_modules', packageName);
  return fileExists(packagePath);
}

/**
 * Get the path to a package in node_modules
 */
export async function getPackagePath(
  root: string,
  packageName: string,
): Promise<string | undefined> {
  const packagePath = path.join(root, 'node_modules', packageName);
  if (await fileExists(packagePath)) return packagePath;

  return undefined;
}

const DEFAULT_TREE_SKIP_DIRS = [
  'node_modules',
  '.git',
  'target',
  'dist',
  '.next',
  'vendor',
  '.venv',
];

/**
 * Check whether any of `filenames` exists within the directory tree rooted at
 * `root`, up to `maxDepth` levels deep (root is depth 0). Heavy/irrelevant
 * directories are skipped to bound the cost.
 *
 * This supports project layouts that markers-at-root checks miss, e.g. a
 * monorepo with `crates/foo/Cargo.toml` and no top-level manifest, a
 * `compile_commands.json` kept under `build/`, or a deeper nesting like
 * `packages/backend/crates/foo/Cargo.toml` (depth 4). The default depth of 5
 * covers these without unbounded recursion; combined with the skip list it
 * runs once per workspace at LSP-activation time (the result is cached
 * upstream), so a bounded breadth-first scan is acceptable.
 */
export async function hasFileInTree(
  root: string,
  filenames: string[],
  opts: { maxDepth?: number; skipDirs?: string[] } = {},
): Promise<boolean> {
  const maxDepth = opts.maxDepth ?? 5;
  const skipDirs = new Set(opts.skipDirs ?? DEFAULT_TREE_SKIP_DIRS);
  const wanted = new Set(filenames);

  let frontier: Array<{ dir: string; depth: number }> = [
    { dir: root, depth: 0 },
  ];

  while (frontier.length > 0) {
    const next: Array<{ dir: string; depth: number }> = [];
    for (const { dir, depth } of frontier) {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isFile() && wanted.has(entry.name)) return true;
      }
      if (depth < maxDepth) {
        for (const entry of entries) {
          // isDirectory() is false for symlinks, so we never follow them
          // and cannot loop on cyclic links.
          if (entry.isDirectory() && !skipDirs.has(entry.name)) {
            next.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
          }
        }
      }
    }
    frontier = next;
  }

  return false;
}
