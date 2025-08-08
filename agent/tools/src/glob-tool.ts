import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { ToolResult } from '@stagewise/agent-types';
import { z } from 'zod';

export const DESCRIPTION = 'Find files and directories matching a glob pattern';

export const globParamsSchema = z.object({
  pattern: z.string().describe('Glob pattern (e.g., "**/*.js")'),
  path: z.string().optional().describe('Relative directory path to search in'),
});

export type GlobParams = z.infer<typeof globParamsSchema>;

/**
 * Glob tool for finding files and directories matching a pattern
 * - Uses the file system's glob functionality for efficient pattern matching
 * - Supports standard glob syntax (*, **, ?, [abc], etc.)
 * - Can search from a specific directory or the current working directory
 * - Returns matching file paths
 */
export async function globTool(
  params: GlobParams,
  clientRuntime: ClientRuntime,
): Promise<ToolResult> {
  const { pattern, path } = params;

  // Validate required parameters
  if (!pattern) {
    return {
      success: false,
      message: 'Missing required parameter: pattern',
      error: 'MISSING_PATTERN',
    };
  }

  try {
    // Use the provided path as the search directory, or fall back to cwd
    const searchPath = path || undefined;

    // Perform the glob search
    const globResult = await clientRuntime.fileSystem.glob(pattern, {
      cwd: searchPath,
      absolute: false, // Return relative paths by default
      includeDirectories: true, // Include both files and directories
      respectGitignore: true, // Respect .gitignore by default
    });

    if (!globResult.success) {
      return {
        success: false,
        message: `Glob search failed: ${globResult.message}`,
        error: globResult.error || 'GLOB_ERROR',
      };
    }

    // Format the success message
    const searchLocation = path ? ` in "${path}"` : ' in current directory';
    const message = `Found ${globResult.totalMatches || 0} matches for pattern "${pattern}"${searchLocation}`;

    return {
      success: true,
      message,
      result: {
        paths: globResult.paths,
        totalMatches: globResult.totalMatches,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Glob search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
