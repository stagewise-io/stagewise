import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';
import { TOOL_OUTPUT_LIMITS } from '../../constants.js';
import {
  capToolOutput,
  formatTruncationMessage,
} from '../../utils/tool-output-capper.js';
import { rethrowCappedToolOutputError } from '../../utils/error';

export const DESCRIPTION = `Search for files and directories matching a glob pattern (like 'find' command). Use when searching by name or file type patterns.

Parameters:
- pattern (string, REQUIRED): Glob pattern supporting standard syntax (*, **, ?, [abc]). Examples: '**/*.test.ts' for test files, 'src/**/config.json' for configs.

Behavior: Respects .gitignore by default. Returns relative file paths sorted by modification time. Output capped at 50 results and 40KB total.`;

export const globParamsSchema = z.object({
  pattern: z
    .string()
    .describe(
      "Glob pattern supporting standard syntax (*, **, ?, [abc]). Examples: '**/*.test.ts' for test files, 'src/**/config.json' for configs.",
    ),
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
  const { pattern } = params;

  try {
    // Perform the glob search
    const globResult = await clientRuntime.fileSystem.glob(pattern, {
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
    const searchLocation = ` in "${clientRuntime.fileSystem.getCurrentWorkingDirectory()}"`;
    let message = `Found ${globResult.totalMatches || 0} matches for pattern "${pattern}"${searchLocation}`;

    // Add truncation message with helpful suggestions if results were capped
    if (cappedOutput.truncated) {
      const originalCount = globResult.totalMatches || 0;
      const suggestions = [
        'Use a more specific glob pattern (e.g., "src/**/*.ts" instead of "**/*.ts")',
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
    rethrowCappedToolOutputError(error);
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
