import type {
  BaseFileSystemProvider,
  GrepResult,
} from '@stagewise/agent-runtime-interface';
import { grepNodeFallback } from './grep-node-fallback.js';
import { grepWithRipgrep } from './grep-ripgrep.js';

export async function grep(
  fileSystem: BaseFileSystemProvider,
  relativePath: string,
  pattern: string,
  options?: {
    recursive?: boolean;
    maxDepth?: number;
    filePattern?: string;
    caseSensitive?: boolean;
    maxMatches?: number;
    excludePatterns?: string[];
    respectGitignore?: boolean;
    searchBinaryFiles?: boolean;
  },
): Promise<GrepResult> {
  const ripgrepResult = await grepWithRipgrep(
    fileSystem,
    relativePath,
    pattern,
    options,
  );
  if (ripgrepResult !== null) return ripgrepResult;
  return grepNodeFallback(fileSystem, relativePath, pattern, options);
}
