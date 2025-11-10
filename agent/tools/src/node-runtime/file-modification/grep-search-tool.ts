import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';
import { TOOL_OUTPUT_LIMITS } from '../../constants.js';
import {
  capToolOutput,
  truncatePreview,
  formatTruncationMessage,
} from '../../utils/tool-output-capper.js';

export const DESCRIPTION =
  'Fast, exact regex searches over text files using ripgrep. Use this tool to search for the right files in the project.';

export const grepSearchParamsSchema = z.object({
  query: z.string().describe('The regex pattern to search for'),
  case_sensitive: z
    .boolean()
    .optional()
    .describe('Whether the search should be case sensitive'),
  include_file_pattern: z
    .string()
    .optional()
    .describe('Glob pattern for files to include (e.g., "*.ts", "**/*.ts")'),
  exclude_file_pattern: z
    .string()
    .optional()
    .describe('Glob pattern for files to exclude (e.g., "**/test-*.js")'),
  max_matches: z
    .number()
    .optional()
    .default(15)
    .describe(
      `Maximum number of matches to return (default: 15). Results may be truncated if this limit is exceeded. Not more than ${TOOL_OUTPUT_LIMITS.GREP.MAX_MATCHES} are allowed.`,
    ),
  explanation: z
    .string()
    .describe('One sentence explanation of why this tool is being used'),
});

export type GrepSearchParams = z.infer<typeof grepSearchParamsSchema>;

/**
 * Grep search tool for fast regex searches across files
 * - Uses the file system's grep functionality for efficient searching
 * - Supports case-sensitive/insensitive searches
 * - Can filter files by include/exclude patterns
 * - Returns matches with file paths, line numbers, and previews
 */
export async function grepSearchToolExecute(
  params: GrepSearchParams,
  clientRuntime: ClientRuntime,
) {
  const {
    query,
    case_sensitive,
    include_file_pattern,
    exclude_file_pattern,
    max_matches = TOOL_OUTPUT_LIMITS.GREP.MAX_MATCHES,
    explanation: _explanation,
  } = params;

  try {
    // Build exclude patterns array if exclude_file_pattern is provided
    const excludePatterns = exclude_file_pattern
      ? [exclude_file_pattern]
      : undefined;

    // Perform the grep search with max matches limit
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
        maxMatches: max_matches,
      },
    );

    if (!grepResult.success)
      throw new Error(
        `Grep search failed: ${grepResult.message} - ${grepResult.error || ''}`,
      );

    // Truncate each match preview to prevent context bloat
    const truncatedMatches = (grepResult.matches || []).map((match) => ({
      ...match,
      preview: truncatePreview(
        match.preview,
        TOOL_OUTPUT_LIMITS.GREP.MAX_MATCH_PREVIEW_LENGTH,
      ),
    }));

    // Build initial result object
    const resultData = {
      matches: truncatedMatches,
      totalMatches: grepResult.totalMatches,
      filesSearched: grepResult.filesSearched,
    };

    // Apply output capping to prevent LLM context bloat
    const cappedMatches = capToolOutput(resultData.matches, {
      maxBytes: TOOL_OUTPUT_LIMITS.GREP.MAX_TOTAL_OUTPUT_SIZE,
      maxItems: Math.min(
        params.max_matches,
        TOOL_OUTPUT_LIMITS.GREP.MAX_MATCHES,
      ),
    });

    const cappedOutput = {
      totalMatches: resultData.totalMatches,
      filesSearched: resultData.filesSearched,
      matches: cappedMatches.result,
      truncated: cappedMatches.truncated,
      itemsRemoved: cappedMatches.itemsRemoved,
    };

    // Check if results were truncated by match limit OR output capping
    const matchCountTruncated = grepResult.totalMatches === max_matches;
    const sizeTruncated = cappedOutput.truncated;
    const wasTruncated = matchCountTruncated || sizeTruncated;

    // Format the success message
    let message = `Found ${grepResult.totalMatches || 0} matches`;
    if (matchCountTruncated)
      message = `Found ${max_matches}+ matches (showing first ${max_matches})`;

    if (grepResult.filesSearched !== undefined)
      message += ` in ${grepResult.filesSearched} files`;

    if (include_file_pattern) message += ` (included: ${include_file_pattern})`;

    if (exclude_file_pattern) message += ` (excluded: ${exclude_file_pattern})`;

    // Add truncation message with helpful suggestions
    if (wasTruncated) {
      const suggestions = [];
      if (!include_file_pattern) {
        suggestions.push(
          'Use include_file_pattern to search specific file types (e.g., "*.ts")',
        );
      }
      if (!exclude_file_pattern) {
        suggestions.push(
          'Use exclude_file_pattern to skip irrelevant directories (e.g., "node_modules")',
        );
      }
      suggestions.push('Use a more specific regex pattern');
      suggestions.push('Search in a subdirectory instead of the root');

      if (cappedOutput.itemsRemoved) {
        message += formatTruncationMessage(
          cappedOutput.itemsRemoved,
          grepResult.totalMatches || 0,
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
        truncated: wasTruncated,
      },
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    else throw new Error(`Unknown Error`);
  }
}

export const grepSearchTool = (clientRuntime: ClientRuntime) =>
  tool({
    name: 'grepSearchTool',
    description: DESCRIPTION,
    inputSchema: grepSearchParamsSchema,
    execute: async (args) => {
      return validateToolOutput(
        await grepSearchToolExecute(args, clientRuntime),
      );
    },
  });
