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
import { rethrowCappedToolOutputError } from '../../utils/error';

export const DESCRIPTION = `Fast regex search across text files using ripgrep. Use to find code patterns, function definitions, or specific text.

Parameters:
- query (string, REQUIRED): Regex pattern using ripgrep syntax (similar to PCRE). Search for exact code strings or patterns.
- case_sensitive (boolean, OPTIONAL): Whether search is case sensitive. Defaults to false (case insensitive).
- include_file_pattern (string, OPTIONAL): Glob pattern for files to include. Examples: "*.ts", "**/*.tsx", "src/**/*.js".
- exclude_file_pattern (string, OPTIONAL): Glob pattern for files to exclude. Examples: "**/test-*.js", "metadata/**".
- max_matches (number, OPTIONAL): Maximum matches to return. Defaults to 15, maximum allowed is 50.
- explanation (string, REQUIRED): One sentence explaining why this tool is being used.

Behavior: Searches recursively from current directory. Respects .gitignore by default. Returns matches with file paths, line numbers (1-indexed), and previews (max 500 chars each). Output capped at 50 matches and 40KB total. Binary files automatically skipped.`;

export const grepSearchParamsSchema = z.object({
  query: z
    .string()
    .describe(
      'Regex pattern using ripgrep syntax (similar to PCRE). Search for exact code strings or patterns.',
    ),
  case_sensitive: z
    .boolean()
    .optional()
    .describe(
      'Whether search is case sensitive. Defaults to false (case insensitive).',
    ),
  include_file_pattern: z
    .string()
    .optional()
    .describe(
      'Glob pattern for files to include. Examples: "*.ts", "**/*.tsx", "src/**/*.js".',
    ),
  exclude_file_pattern: z
    .string()
    .optional()
    .describe(
      'Glob pattern for files to exclude. Examples: "**/test-*.js", "metadata/**".',
    ),
  max_matches: z
    .number()
    .optional()
    .default(15)
    .describe(
      `Maximum matches to return. Defaults to 15, maximum allowed is ${TOOL_OUTPUT_LIMITS.GREP.MAX_MATCHES}.`,
    ),
  explanation: z
    .string()
    .describe('One sentence explaining why this tool is being used.'),
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
    const grepResult = await clientRuntime.fileSystem.grep(query, {
      recursive: true, // Always search recursively
      caseSensitive: case_sensitive,
      filePattern: include_file_pattern,
      excludePatterns: excludePatterns,
      maxDepth: undefined, // No depth limit
      respectGitignore: true, // Respect .gitignore by default
      maxMatches: max_matches,
    });

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
          'Use exclude_file_pattern to skip irrelevant directories (e.g., "metadata/**")',
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
    rethrowCappedToolOutputError(error);
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
