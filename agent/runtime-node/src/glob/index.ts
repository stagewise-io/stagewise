import type {
  BaseFileSystemProvider,
  GlobResult,
  GlobOptions,
} from '@stagewise/agent-runtime-interface';
import { globWithRipgrep } from './glob-ripgrep.js';
import { globNodeFallback } from './glob-node-fallback.js';

export async function glob(
  fileSystem: BaseFileSystemProvider,
  pattern: string,
  rgBinaryBasePath: string,
  options?: GlobOptions,
): Promise<GlobResult> {
  const ripgrepResult = await globWithRipgrep(
    fileSystem,
    pattern,
    rgBinaryBasePath,
    options,
  );
  if (ripgrepResult !== null) return ripgrepResult;
  return globNodeFallback(pattern, fileSystem, options);
}
