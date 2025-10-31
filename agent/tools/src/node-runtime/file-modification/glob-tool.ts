import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { validateToolOutput } from '../..';
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
export async function globToolExecute(
  params: GlobParams,
  clientRuntime: ClientRuntime,
) {
  const { pattern, path } = params;

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

    if (!globResult.success)
      throw new Error(
        `Glob search failed: ${globResult.error}: ${globResult.message} - ${globResult.error || ''}`,
      );

    // Format the success message
    const searchLocation = path ? ` in "${path}"` : ' in current directory';
    const message = `Found ${globResult.totalMatches || 0} matches for pattern "${pattern}"${searchLocation}`;

    return {
      message,
      result: {
        relativePaths: globResult.relativePaths,
        totalMatches: globResult.totalMatches,
      },
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    else throw new Error('Unknown Error');
  }
}

export const globTool = (clientRuntime: ClientRuntime) =>
  tool({
    name: 'globTool',
    description: DESCRIPTION,
    inputSchema: globParamsSchema,
    execute: async (args) => {
      return validateToolOutput(await globToolExecute(args, clientRuntime));
    },
  });
