import type {
  BaseFileSystemProvider,
  GrepResult,
} from '@stagewise/agent-runtime-interface';
import { grepNodeFallback } from './grep-node-fallback.js';
import { grepWithRipgrep } from './grep-ripgrep.js';

export async function grep(
  fileSystem: BaseFileSystemProvider,
  searchPath: string,
  pattern: string,
  rgBinaryBasePath: string,
  options?: {
    recursive?: boolean;
    maxDepth?: number;
    filePattern?: string;
    caseSensitive?: boolean;
    maxMatches?: number;
    excludePatterns?: string[];
    respectGitignore?: boolean;
    searchBinaryFiles?: boolean;
    absoluteSearchPath?: boolean;
    absoluteSearchResults?: boolean;
  },
): Promise<GrepResult> {
  const ripgrepResult = await grepWithRipgrep(
    fileSystem,
    searchPath,
    pattern,
    rgBinaryBasePath,
    options,
  );
  if (ripgrepResult !== null) return ripgrepResult;
  return grepNodeFallback(fileSystem, searchPath, pattern, options);
}
