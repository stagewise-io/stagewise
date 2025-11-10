import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';
import { TOOL_OUTPUT_LIMITS } from '../../constants.js';
import {
  capToolOutput,
  formatTruncationMessage,
} from '../../utils/tool-output-capper.js';

export const DESCRIPTION =
  "Search for files matching a pattern across the project (like 'find' command). Use when you know what you're looking for by name or type (e.g., '**/*.test.ts' for test files, 'src/**/config.json' for configs). Returns matching file paths.";

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

    // Build initial result object
    const resultData = {
      relativePaths: globResult.relativePaths,
      totalMatches: globResult.totalMatches,
    };

    // Apply output capping to prevent LLM context bloat
    const cappedPaths = capToolOutput(resultData.relativePaths, {
      maxBytes: TOOL_OUTPUT_LIMITS.GLOB.MAX_TOTAL_OUTPUT_SIZE,
      maxItems: TOOL_OUTPUT_LIMITS.GLOB.MAX_RESULTS,
    });

    const cappedOutput = {
      totalMatches: resultData.totalMatches,
      relativePaths: cappedPaths.result,
      truncated: cappedPaths.truncated,
      itemsRemoved: cappedPaths.itemsRemoved,
    };

    // Format the success message
    const searchLocation = path ? ` in "${path}"` : ' in current directory';
    let message = `Found ${globResult.totalMatches || 0} matches for pattern "${pattern}"${searchLocation}`;

    // Add truncation message with helpful suggestions if results were capped
    if (cappedOutput.truncated) {
      const originalCount = globResult.totalMatches || 0;
      const suggestions = [
        'Use a more specific glob pattern (e.g., "src/**/*.ts" instead of "**/*.ts")',
        'Search in a subdirectory by specifying the path parameter',
        'Break down your search into multiple smaller queries',
      ];

      if (cappedOutput.itemsRemoved) {
        message += formatTruncationMessage(
          cappedOutput.itemsRemoved,
          originalCount,
          suggestions,
        );
      } else {
        message += TOOL_OUTPUT_LIMITS.DEFAULT_TRUNCATION_MESSAGE;
        message += '\nSuggestions:\n';
        message += suggestions.map((s) => `  - ${s}`).join('\n');
      }
    }

    return {
      message,
      result: {
        ...cappedOutput,
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
