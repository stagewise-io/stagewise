import {
  type GlobToolInput,
  globToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import {
  rethrowCappedToolOutputError,
  capToolOutput,
  formatTruncationMessage,
  type MountedClientRuntimes,
} from '../../utils';

/* Due to an issue in zod schema conversion in the ai sdk,
   the schema descriptions are not properly used for the prompts -
   thus, we include them in the descriptions as well. */
export const DESCRIPTION = `Find files and directories BY THEIR PATH/NAME using glob patterns (like 'find' command). Use when searching for files by name or extension. NOT for searching inside file contents (use grepSearch for that).

Parameters:
- pattern (string, REQUIRED): Glob pattern supporting standard syntax (*, **, ?, [abc]). Examples: '**/*.test.ts' for test files, 'src/**/config.json' for configs.
- include_gitignored (boolean, OPTIONAL): If true, includes files from gitignored paths (e.g. node_modules, dist). Always use a scoped glob pattern (e.g. 'node_modules/lodash/**/*.js') to avoid excessive results. Defaults to false.

Behavior: Respects .gitignore by default. Returns relative file paths sorted by modification time. Output capped at 50 results and 40KB total.`;

/**
 * Glob tool for finding files and directories matching a pattern
 * - Uses the file system's glob functionality for efficient pattern matching
 * - Supports standard glob syntax (*, **, ?, [abc], etc.)
 * - Can search from a specific directory or the current working directory
 * - Returns matching file paths
 */
export async function globToolExecute(
  params: GlobToolInput,
  mountedRuntimes: MountedClientRuntimes,
) {
  const clientRuntime = mountedRuntimes.get(params.mount_prefix);
  if (!clientRuntime) throw new Error('Mounted path not found');
  const { pattern } = params;

  try {
    // Perform the glob search
    const globResult = await clientRuntime.fileSystem.glob(pattern, {
      respectGitignore: !params.include_gitignored,
      maxResults: 50,
    });

    if (!globResult.success)
      throw new Error(
        `Glob search failed: ${globResult.error}: ${globResult.message} - ${globResult.error || ''}`,
      );

    // Build initial result object
    const resultData = {
      relativePaths: globResult.relativePaths,
      totalMatches: globResult.totalMatches || 0,
    };

    // Apply output capping to prevent LLM context bloat
    const cappedPaths = capToolOutput(resultData.relativePaths, {
      maxItems: 50,
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
        message +=
          '\n[Results truncated due to size limits. Use more specific patterns or filters to narrow your search.]';
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

export const glob = (mountedRuntimes: MountedClientRuntimes) =>
  tool({
    description: DESCRIPTION,
    inputSchema: globToolInputSchema,
    strict: false,
    execute: async (args) => {
      return globToolExecute(args, mountedRuntimes);
    },
  });
