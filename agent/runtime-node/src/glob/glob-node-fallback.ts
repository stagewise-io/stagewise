import { promises as fs, type Dirent } from 'node:fs';
import { join, relative } from 'node:path';
import type {
  BaseFileSystemProvider,
  GlobResult,
} from '@stagewise/agent-runtime-interface';
import { makeRe as makeGlobRe, minimatch } from 'minimatch';

export async function globNodeFallback(
  pattern: string,
  fileSystem: BaseFileSystemProvider,
  options?: {
    cwd?: string;
    absolute?: boolean;
    excludePatterns?: string[];
    respectGitignore?: boolean;
  },
): Promise<GlobResult> {
  try {
    const paths: string[] = [];
    const basePath = options?.cwd
      ? fileSystem.resolvePath(options.cwd)
      : fileSystem.getCurrentWorkingDirectory();

    const excludeRes = (options?.excludePatterns ?? []).map((p) =>
      makeGlobRe(p),
    );
    const shouldSkipRel = (rel: string) =>
      excludeRes.some((re) => re !== false && re.test(rel));

    const walkQueue: string[] = [basePath];

    while (walkQueue.length) {
      const dir = walkQueue.pop()!;
      try {
        const dirHandle = await fs.opendir(dir);

        // Collect all entries before processing to avoid handle lifecycle issues
        const entries: Array<{ dirent: Dirent; full: string; rel: string }> =
          [];
        for await (const dirent of dirHandle) {
          const full = join(dir, dirent.name);
          const rel = relative(basePath, full);
          entries.push({ dirent, full, rel });
        }
        // Note: for await automatically closes the directory handle

        // Now process entries after iteration completes
        for (const { dirent, full, rel } of entries) {
          if (
            options?.respectGitignore !== false &&
            (await fileSystem.isIgnored(full))
          )
            continue;
          if (shouldSkipRel(rel)) continue;

          if (minimatch(rel, pattern) && dirent.isFile())
            paths.push(options?.absolute ? full : rel);

          if (dirent.isDirectory() && pattern.includes('**'))
            walkQueue.push(full);
        }
      } catch {
        continue;
      }
    }

    return {
      success: true,
      message: `Found ${paths.length} matching paths`,
      relativePaths: paths,
      totalMatches: paths.length,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to glob: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
