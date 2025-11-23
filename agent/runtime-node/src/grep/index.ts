import type {
  BaseFileSystemProvider,
  GrepOptions,
  GrepResult,
} from '@stagewise/agent-runtime-interface';
import { grepNodeFallback } from './grep-node-fallback.js';
import { grepWithRipgrep } from './grep-ripgrep.js';

export async function grep(
  fileSystem: BaseFileSystemProvider,
  pattern: string,
  rgBinaryBasePath: string,
  options?: GrepOptions,
): Promise<GrepResult> {
  const ripgrepResult = await grepWithRipgrep(
    fileSystem,
    pattern,
    rgBinaryBasePath,
    options,
  );
  if (ripgrepResult !== null) return ripgrepResult;
  return grepNodeFallback(fileSystem, pattern, options);
}
