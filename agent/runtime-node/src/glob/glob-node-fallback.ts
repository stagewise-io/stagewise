import { promises as fs, type Dirent } from 'node:fs';
import path, { join } from 'node:path';
import type {
  FileSystemOperations,
  GlobOptions,
  GlobResult,
} from '../types.js';
import { makeRe as makeGlobRe, minimatch } from 'minimatch';
import { toPosixPath } from './utils.js';

export async function globNodeFallback(
  pattern: string,
  fileSystem: FileSystemOperations,
  options?: GlobOptions,
): Promise<GlobResult> {
  try {
    const paths: string[] = [];
    const basePath = options?.absoluteSearchPath
      ? options.absoluteSearchPath
      : fileSystem.getCurrentWorkingDirectory();

    const excludeRes = (options?.excludePatterns ?? []).map((p) =>
      makeGlobRe(p),
    );
    const shouldSkipRel = (rel: string) =>
      excludeRes.some((re) => re !== false && re.test(rel));

    const walkQueue: string[] = [basePath];
    const maxResults = options?.maxResults;

    while (walkQueue.length) {
      if (maxResults && paths.length >= maxResults) break;

      const dir = walkQueue.pop()!;
      try {
        const dirHandle = await fs.opendir(dir);

        const entries: Array<{ dirent: Dirent; full: string; rel: string }> =
          [];
        for await (const dirent of dirHandle) {
          const full = join(dir, dirent.name);
          const rel = toPosixPath(
            path.relative(fileSystem.getCurrentWorkingDirectory(), full),
          );
          entries.push({ dirent, full, rel });
        }

        for (const { dirent, full, rel } of entries) {
          if (maxResults && paths.length >= maxResults) break;

          if (
            options?.respectGitignore !== false &&
            (await fileSystem.isIgnored(full))
          )
            continue;
          if (shouldSkipRel(rel)) continue;

          const matches = minimatch(rel, pattern);

          if (matches && dirent.isFile()) {
            const resultPath = options?.absoluteSearchPath ? full : rel;
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
      absolutePaths: paths.map((p) => fileSystem.resolvePath(p)),
      totalMatches: paths.length,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to glob: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error',
      relativePaths: [],
      absolutePaths: [],
    };
  }
}
