import { promises as fs, type Dirent } from 'node:fs';
import path, { join } from 'node:path';
import type {
  BaseFileSystemProvider,
  GlobResult,
} from '@stagewise/agent-runtime-interface';
import { makeRe as makeGlobRe, minimatch } from 'minimatch';
import nodeProcess from 'node:process';

export async function globNodeFallback(
  pattern: string,
  fileSystem: BaseFileSystemProvider,
  options?: {
    searchPath?: string;
    includeDirectories?: boolean;
    excludePatterns?: string[];
    respectGitignore?: boolean;
    absoluteSearchPath?: boolean;
    absoluteSearchResults?: boolean;
  },
): Promise<GlobResult> {
  try {
    const paths: string[] = [];
    const basePath = options?.searchPath
      ? options.absoluteSearchPath
        ? path.resolve(path.parse(nodeProcess.cwd()).root, options.searchPath)
        : path.join(fileSystem.getCurrentWorkingDirectory(), options.searchPath)
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
          const rel = path.relative(
            fileSystem.getCurrentWorkingDirectory(),
            full,
          );
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

          // Always match against relative path for pattern matching
          const matches = minimatch(rel, pattern);

          if (
            matches &&
            (dirent.isFile() ||
              (options?.includeDirectories && dirent.isDirectory()))
          ) {
            // Only convert to absolute path for the results if requested
            const resultPath =
              options?.absoluteSearchResults || options?.absoluteSearchPath
                ? full
                : rel;
            paths.push(resultPath);
          }

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
