import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Readable } from 'node:stream';
import type {
  GrepMatch,
  GrepResult,
  BaseFileSystemProvider,
} from '@stagewise/agent-runtime-interface';
import { createInterface } from 'node:readline';
import { relative } from 'node:path';
import { getRipgrepPath } from '../vscode-ripgrep/get-path.js';

/**
 * Options for executing ripgrep, matching the grep function's options
 */
export interface RipgrepOptions {
  recursive?: boolean;
  maxDepth?: number;
  filePattern?: string;
  caseSensitive?: boolean;
  maxMatches?: number;
  excludePatterns?: string[];
  respectGitignore?: boolean;
  searchBinaryFiles?: boolean;
}

/**
 * Builds ripgrep command-line arguments from options.
 *
 * @param pattern - Search pattern (regex)
 * @param searchPath - Path to search in
 * @param options - Search options
 * @returns Array of command-line arguments
 */
function buildRipgrepGrepArgs(
  pattern: string,
  searchPath: string,
  options?: RipgrepOptions,
): string[] {
  const args: string[] = [];
  // Always use JSON output for structured parsing
  args.push('--json');
  // Ignore user config files for deterministic behavior
  args.push('--no-config');
  // Ignore global gitignore
  args.push('--no-ignore-global');
  // Case sensitivity
  if (options?.caseSensitive) args.push('--case-sensitive');
  else args.push('-i'); // case-insensitive
  // Max matches per file
  if (options?.maxMatches !== undefined)
    args.push('--max-count', String(options.maxMatches));
  // Max depth for recursion
  if (options?.maxDepth !== undefined)
    args.push('--max-depth', String(options.maxDepth));
  // File pattern filter
  if (options?.filePattern) args.push('-g', options.filePattern);
  // Exclude patterns
  if (options?.excludePatterns && options.excludePatterns.length > 0)
    for (const excludePattern of options.excludePatterns)
      args.push('--glob', `!${excludePattern}`);
  // Gitignore handling
  if (options?.respectGitignore === false) args.push('--no-ignore');
  // Binary file handling
  if (options?.searchBinaryFiles) args.push('--text'); // Force text mode, search binary files
  // Search pattern (must come after all options)
  args.push('-e', pattern);
  // Search path
  args.push(searchPath);
  return args;
}

/**
 * Executes ripgrep with the given options and returns the process and stdout stream.
 *
 * @param binaryPath - Absolute path to ripgrep binary
 * @param pattern - Search pattern
 * @param searchPath - Path to search in
 * @param options - Search options
 * @returns Promise resolving to execution result, or null if spawn fails
 */
export async function executeRipgrep(
  binaryPath: string,
  pattern: string,
  searchPath: string,
  options?: RipgrepOptions,
  onError?: (error: Error) => void,
) {
  try {
    const args = buildRipgrepGrepArgs(pattern, searchPath, options);

    const process = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'], // stdin ignored, stdout/stderr piped
      windowsHide: true, // Don't show console window on Windows
    });

    // Check if the process spawned successfully
    if (!process.stdout) return null;

    // Handle process errors
    process.on('error', (error) => {
      onError?.(new Error(`Ripgrep process error: ${error}`));
    });

    return {
      stdout: process.stdout,
      process,
    };
  } catch (error) {
    onError?.(new Error(`Failed to execute ripgrep: ${error}`));
    return null;
  }
}

/**
 * Ripgrep JSON output message types
 */
interface RipgrepBegin {
  type: 'begin';
  data: {
    path: { text: string };
  };
}

interface RipgrepMatch {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
    submatches: Array<{
      match: { text: string };
      start: number;
      end: number;
    }>;
  };
}

interface RipgrepContext {
  type: 'context';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
  };
}

interface RipgrepEnd {
  type: 'end';
  data: {
    path: { text: string };
    binary_offset: number | null;
    stats: {
      elapsed: { human: string; nanos: number };
      searches: number;
      searches_with_match: number;
    };
  };
}

interface RipgrepSummary {
  type: 'summary';
  data: {
    elapsed_total: { human: string; nanos: number };
    stats: {
      elapsed: { human: string; nanos: number };
      searches: number;
      searches_with_match: number;
    };
  };
}

type RipgrepMessage =
  | RipgrepBegin
  | RipgrepMatch
  | RipgrepContext
  | RipgrepEnd
  | RipgrepSummary;

/**
 * Maximum size for a single JSON line to prevent memory issues
 * (10MB like VS Code does)
 */
const MAX_LINE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Parses ripgrep's JSON output stream and converts it to GrepResult format.
 *
 * Ripgrep outputs one JSON object per line with different message types:
 * - 'begin': Indicates start of results for a file
 * - 'match': Contains actual match data
 * - 'end': Indicates end of results for a file
 * - 'summary': Final summary statistics
 *
 * @param stdout - Readable stream from ripgrep process stdout
 * @param workingDirectory - Base directory for calculating relative paths
 * @returns Promise resolving to GrepResult
 */
async function parseRipgrepGrepOutput(
  stdout: Readable,
  workingDirectory: string,
  onError?: (error: Error) => void,
): Promise<GrepResult> {
  const matches: GrepMatch[] = [];
  const filesSearched = new Set<string>();

  // Track context lines for building previews
  const contextBuffer: Map<
    string,
    Array<{ lineNum: number; text: string }>
  > = new Map();

  return new Promise((resolve) => {
    const rl = createInterface({
      input: stdout,
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    rl.on('line', (line: string) => {
      // Skip overly large lines to prevent memory issues
      if (line.length > MAX_LINE_SIZE) {
        onError?.(
          new Error(
            `Skipping overly large ripgrep output line (${line.length} bytes)`,
          ),
        );
        return;
      }

      try {
        const message = JSON.parse(line) as RipgrepMessage;

        if (message.type === 'context') {
          // Store context lines for building previews
          const contextData = message.data;
          const filePath = contextData.path.text;
          if (!contextBuffer.has(filePath)) contextBuffer.set(filePath, []);

          contextBuffer.get(filePath)?.push({
            lineNum: contextData.line_number,
            text: contextData.lines.text,
          });
        } else if (message.type === 'match') {
          const matchData = message.data;
          filesSearched.add(matchData.path.text);

          // For now, just use the line itself as preview
          // Context will be added by ripgrep in the lines.text field when using context flags
          const preview = matchData.lines.text;

          // Process each submatch in the line
          for (const submatch of matchData.submatches) {
            matches.push({
              relativePath: relative(workingDirectory, matchData.path.text),
              line: matchData.line_number,
              column: submatch.start + 1, // Convert 0-based to 1-based
              match: submatch.match.text,
              preview,
            });
          }
        } else if (message.type === 'begin') {
          // Track file being searched
          filesSearched.add(message.data.path.text);
          // Clear context buffer for new file
          contextBuffer.set(message.data.path.text, []);
        }
      } catch (error) {
        // Skip invalid JSON lines (shouldn't happen with ripgrep --json)
        onError?.(new Error(`Failed to parse ripgrep JSON output: ${error}`));
      }
    });

    rl.on('close', () => {
      const message = `Found ${matches.length} matches in ${filesSearched.size} files`;

      resolve({
        success: true,
        message,
        matches,
        totalMatches: matches.length,
        filesSearched: filesSearched.size,
      });
    });

    rl.on('error', (error) => {
      onError?.(new Error(`Error reading ripgrep output: ${error}`));
      resolve({
        success: false,
        message: `Failed to parse ripgrep output: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  });
}

/**
 * Executes grep using ripgrep binary for improved performance.
 *
 * This function attempts to use the platform-specific ripgrep binary for
 * searching. If ripgrep is not available or fails, it returns null to
 * allow fallback to the Node.js implementation.
 *
 * @param fileSystem - File system provider for path resolution
 * @param relativePath - Path to search (file or directory)
 * @param pattern - Search pattern (regex)
 * @param basePath - Base directory where ripgrep binary is installed
 * @param options - Search options
 * @returns GrepResult if successful, null if ripgrep unavailable/failed
 */
export async function grepWithRipgrep(
  fileSystem: BaseFileSystemProvider,
  relativePath: string,
  pattern: string,
  basePath: string,
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
  onError?: (error: Error) => void,
): Promise<GrepResult | null> {
  try {
    const rgPath = getRipgrepPath(basePath);

    // Check if ripgrep executable exists
    if (!rgPath || !existsSync(rgPath)) return null;

    const searchPath = fileSystem.resolvePath(relativePath);
    const execution = await executeRipgrep(
      rgPath,
      pattern,
      searchPath,
      options,
    );
    if (!execution) return null;

    const result = await parseRipgrepGrepOutput(
      execution.stdout,
      fileSystem.getCurrentWorkingDirectory(),
      onError,
    );

    return result;
  } catch (error) {
    // Any error during ripgrep execution - log and return null for fallback
    onError?.(
      new Error(
        `Ripgrep execution failed, falling back to Node.js implementation: ${error}`,
      ),
    );
    return null;
  }
}
