import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { ToolResult } from '@stagewise/agent-types';
import { z } from 'zod';

export const DESCRIPTION =
  'Fast, exact regex searches over text files using ripgrep';

export const grepSearchParamsSchema = z.object({
  query: z.string().describe('The regex pattern to search for'),
  case_sensitive: z
    .boolean()
    .optional()
    .describe('Whether the search should be case sensitive'),
  include_file_pattern: z
    .string()
    .optional()
    .describe('Glob pattern for files to include (e.g., "*.ts")'),
  exclude_file_pattern: z
    .string()
    .optional()
    .describe('Glob pattern for files to exclude'),
  explanation: z
    .string()
    .describe('One sentence explanation of why this tool is being used'),
});

export type GrepSearchParams = z.infer<typeof grepSearchParamsSchema>;

const _grepMatchSchema = z.object({
  path: z.string(),
  line: z.number(),
  column: z.number(),
  match: z.string(),
  preview: z.string(),
});

/**
 * Grep search tool for fast regex searches across files
 * - Uses the file system's grep functionality for efficient searching
 * - Supports case-sensitive/insensitive searches
 * - Can filter files by include/exclude patterns
 * - Returns matches with file paths, line numbers, and previews
 */
export async function grepSearchTool(
  params: GrepSearchParams,
  clientRuntime: ClientRuntime,
): Promise<ToolResult> {
  const {
    query,
    case_sensitive,
    include_file_pattern,
    exclude_file_pattern,
    explanation,
  } = params;

  // Validate required parameters
  if (!query) {
    return {
      undoExecute: () => Promise.resolve(),
      success: false,
      message: 'Missing required parameter: query',
      error: 'MISSING_QUERY',
    };
  }

  if (!explanation) {
    return {
      undoExecute: () => Promise.resolve(),
      success: false,
      message: 'Missing required parameter: explanation',
      error: 'MISSING_EXPLANATION',
    };
  }

  try {
    // Build exclude patterns array if exclude_file_pattern is provided
    const excludePatterns = exclude_file_pattern
      ? [exclude_file_pattern]
      : undefined;

    // Perform the grep search
    const grepResult = await clientRuntime.fileSystem.grep(
      '.', // Search in the current working directory
      query,
      {
        recursive: true, // Always search recursively
        caseSensitive: case_sensitive,
        filePattern: include_file_pattern,
        excludePatterns: excludePatterns,
        maxDepth: undefined, // No depth limit
        respectGitignore: true, // Respect .gitignore by default
      },
    );

    if (!grepResult.success) {
      return {
        undoExecute: () => Promise.resolve(),
        success: false,
        message: `Grep search failed: ${grepResult.message}`,
        error: grepResult.error || 'GREP_ERROR',
      };
    }

    // Format the success message
    let message = `Found ${grepResult.totalMatches || 0} matches`;
    if (grepResult.filesSearched !== undefined) {
      message += ` in ${grepResult.filesSearched} files`;
    }
    if (include_file_pattern) {
      message += ` (included: ${include_file_pattern})`;
    }
    if (exclude_file_pattern) {
      message += ` (excluded: ${exclude_file_pattern})`;
    }

    return {
      undoExecute: () => Promise.resolve(),
      success: true,
      message,
      result: {
        matches: grepResult.matches,
        totalMatches: grepResult.totalMatches,
        filesSearched: grepResult.filesSearched,
      },
    };
  } catch (error) {
    return {
      undoExecute: () => Promise.resolve(),
      success: false,
      message: `Grep search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
