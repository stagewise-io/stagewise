import type {
  BaseFileSystemProvider,
  GlobResult,
} from '@stagewise/agent-runtime-interface';
import { globWithRipgrep } from './glob-ripgrep.js';
import { globNodeFallback } from './glob-node-fallback.js';

export async function glob(
  fileSystem: BaseFileSystemProvider,
  pattern: string,
  basePath: string,
  options?: {
    cwd?: string;
    absolute?: boolean;
    excludePatterns?: string[];
    respectGitignore?: boolean;
  },
): Promise<GlobResult> {
  const ripgrepResult = await globWithRipgrep(
    fileSystem,
    pattern,
    basePath,
    options,
  );
  if (ripgrepResult !== null) return ripgrepResult;
  return globNodeFallback(pattern, fileSystem, options);
}
