import type {
  BaseFileSystemProvider,
  GlobResult,
} from '@stagewise/agent-runtime-interface';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { relative } from 'node:path';
import { getRipgrepPath } from '../vscode-ripgrep/get-path.js';

/**
 * Options for executing ripgrep glob, matching the glob function's options
 */
export interface RipgrepGlobOptions {
  cwd?: string;
  absolute?: boolean;
  excludePatterns?: string[];
  respectGitignore?: boolean;
}

/**
 * Builds ripgrep command-line arguments for file listing (glob).
 * Follows VS Code's pattern: rg --files --no-config --hidden -g '<pattern>' -g '!<exclude>'
 *
 * @param pattern - Glob pattern (e.g., "src/*.ts" or recursive patterns)
 * @param searchPath - Path to search in
 * @param options - Glob options
 * @returns Array of command-line arguments
 */
function buildRipgrepGlobArgs(
  pattern: string,
  searchPath: string,
  options?: RipgrepGlobOptions,
): string[] {
  const args: string[] = [];

  // List files instead of searching content
  args.push('--files');

  // Ignore user config files for deterministic behavior (VS Code pattern)
  args.push('--no-config');

  // Include hidden files (dotfiles)
  args.push('--hidden');

  // Include pattern
  args.push('-g', pattern);

  // Exclude patterns
  if (options?.excludePatterns && options.excludePatterns.length > 0)
    for (const excludePattern of options.excludePatterns)
      args.push('-g', `!${excludePattern}`);

  // Gitignore handling
  if (options?.respectGitignore === false) args.push('--no-ignore');

  // Search path
  args.push(searchPath);

  return args;
}

/**
 * Parses ripgrep --files output (simple line-based format).
 * Each line is a file path.
 *
 * @param stdout - Readable stream from ripgrep
 * @param workingDirectory - Working directory for relative path calculation
 * @param absolute - Whether to return absolute paths
 * @returns Promise resolving to GlobResult
 */
async function parseRipgrepGlobOutput(
  stdout: NodeJS.ReadableStream,
  workingDirectory: string,
  absolute: boolean,
): Promise<GlobResult> {
  const paths: string[] = [];

  const rl = createInterface({
    input: stdout,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    // Ripgrep returns paths relative to the search directory
    // If absolute is requested, keep as-is (ripgrep gives absolute paths)
    // Otherwise, make relative to working directory
    const path = absolute ? line : relative(workingDirectory, line);
    paths.push(path);
  }

  return {
    success: true,
    message: `Found ${paths.length} matching paths`,
    relativePaths: paths,
    totalMatches: paths.length,
  };
}

/**
 * Executes glob using ripgrep binary for improved performance.
 * Follows VS Code's pattern: uses `rg --files` with glob filters.
 *
 * This function attempts to use the platform-specific ripgrep binary for
 * file enumeration. If ripgrep is not available or fails, it returns null to
 * allow fallback to the Node.js implementation.
 *
 * @param fileSystem - File system provider for path resolution
 * @param pattern - Glob pattern (e.g., "src/*.ts" or recursive patterns)
 * @param basePath - Base directory where ripgrep binary is installed
 * @param options - Glob options
 * @returns GlobResult if successful, null if ripgrep unavailable/failed
 */
export async function globRipgrep(
  fileSystem: BaseFileSystemProvider,
  pattern: string,
  basePath: string,
  options?: RipgrepGlobOptions,
): Promise<GlobResult | null> {
  try {
    const rgPath = getRipgrepPath(basePath);

    // Check if ripgrep executable exists
    if (!rgPath || !existsSync(rgPath)) return null;

    // Determine search path
    const searchPath = options?.cwd
      ? fileSystem.resolvePath(options.cwd)
      : fileSystem.getCurrentWorkingDirectory();

    // Build ripgrep arguments
    const args = buildRipgrepGlobArgs(pattern, searchPath, options);

    // Spawn ripgrep process
    const process = spawn(rgPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'], // stdin ignored, stdout/stderr piped
      windowsHide: true, // Don't show console window on Windows
    });

    // Check if the process spawned successfully
    if (!process.stdout) return null;

    // Parse the output
    const result = await parseRipgrepGlobOutput(
      process.stdout,
      fileSystem.getCurrentWorkingDirectory(),
      options?.absolute ?? false,
    );

    return result;
  } catch {
    // Any error during ripgrep execution - return null for fallback
    return null;
  }
}
