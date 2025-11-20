import { join, relative } from 'node:path';
import { loadGitignore } from './load-gitignore';
import { readdir, readFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';

export async function countLinesOfCode(path: string, fileEnding: string) {
  // Load gitignore rules
  const ig = await loadGitignore(path);
  let totalLines = 0;

  // This is a recursive helper function to traverse the directory tree.
  async function traverse(
    currentPath: string,
    ig: Awaited<ReturnType<typeof loadGitignore>>,
    fileEnding: string,
  ) {
    let entries: Dirent[];
    try {
      // Read directory contents. withFileTypes: true is efficient as it avoids extra stat calls.
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      // The 'ignore' package works best with relative paths from the root of the search.
      const relativePath = relative(path, fullPath);

      // Skip the path if it's ignored.
      if (ig.ignores(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        // If it's a directory, recurse into it.
        await traverse(fullPath, ig, fileEnding);
      } else if (entry.isFile() && entry.name.endsWith(`.${fileEnding}`)) {
        // If it's a file with the correct extension, count its lines.
        try {
          const content = await readFile(fullPath, 'utf8');
          // Split content by newline character and add the count to the total.
          const lines = content.split('\n').length;
          totalLines += lines;
        } catch {}
      }
    }
  }

  // Start the traversal from the initial directory path.
  await traverse(path, ig, fileEnding);
  return totalLines;
}
