import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { validateToolOutput } from '../index.js';
import { z } from 'zod';
import { TOOL_OUTPUT_LIMITS } from '../constants.js';
import {
  capToolOutput,
  formatTruncationMessage,
} from '../utils/tool-output-capper.js';
import { rethrowCappedToolOutputError } from '../utils/error.js';

/* Due to an issue in zod schema conversion in the ai sdk,
   the schema descriptions are not properly used for the prompts -
   thus, we include them in the descriptions as well. */
export const DESCRIPTION = `List files and directories in a path (like 'ls' or 'tree' command). Use when exploring directory structure.
  
  Parameters:
  - relative_path (string, OPTIONAL): Path to list. Defaults to current directory ('.').
  - recursive (boolean, OPTIONAL): Whether to list recursively. Defaults to false.
  - maxDepth (number, OPTIONAL): Maximum recursion depth (must be >= 0). Defaults to unlimited. Depth is 0-indexed from starting directory.
  - pattern (string, OPTIONAL): File extension or glob pattern to filter results. Examples: '.ts', '*.js'.
  - includeDirectories (boolean, OPTIONAL): Include directories in results. Defaults to true.
  - includeFiles (boolean, OPTIONAL): Include files in results. Defaults to true.
  
  Behavior: At least one of includeFiles or includeDirectories must be true. Respects .gitignore by default. Returns file/directory objects with relativePath, name, type, size (files only), and depth. Output capped at 50 items and 40KB total. Path must exist and be a directory, otherwise an error is thrown.`;

export const listFilesParamsSchema = z.object({
  relative_path: z
    .string()
    .optional()
    .describe("Path to list. Defaults to current directory ('.')."),
  recursive: z
    .boolean()
    .optional()
    .describe('Whether to list recursively. Defaults to false.'),
  maxDepth: z
    .number()
    .min(0)
    .optional()
    .describe(
      'Maximum recursion depth (must be >= 0). Defaults to unlimited. Depth is 0-indexed from starting directory.',
    ),
  pattern: z
    .string()
    .optional()
    .describe(
      "File extension or glob pattern to filter results. Examples: '.ts', '*.js'.",
    ),
  includeDirectories: z
    .boolean()
    .optional()
    .describe('Include directories in results. Defaults to true.'),
  includeFiles: z
    .boolean()
    .optional()
    .describe('Include files in results. Defaults to true.'),
});

export type ListFilesParams = z.infer<typeof listFilesParamsSchema>;

/**
 * List files and directories tool
 * - Lists files and directories in the specified path
 * - Supports recursive listing with optional depth limits
 * - Supports filtering by file extension or pattern
 * - Returns detailed file information including type and size
 */
export async function listFilesToolExecute(
  params: ListFilesParams,
  clientRuntime: ClientRuntime,
) {
  const {
    relative_path: relPath = '.',
    recursive = false,
    maxDepth,
    pattern,
    includeDirectories = true,
    includeFiles = true,
  } = params;

  if (!includeFiles && !includeDirectories)
    throw new Error(
      `At least one of includeFiles or includeDirectories must be true`,
    );

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(relPath);

    // Check if path exists and is accessible
    const pathExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!pathExists)
      throw new Error(`Path does not exist or is not accessible: ${relPath}`);

    // Check if path is a directory
    const isDir = await clientRuntime.fileSystem.isDirectory(absolutePath);
    if (!isDir) throw new Error(`Path is not a directory: ${relPath}`);

    // Use the ClientRuntime's listDirectory function which already implements most of our needs
    const result = await clientRuntime.fileSystem.listDirectory(absolutePath, {
      recursive,
      maxDepth,
      pattern,
      includeDirectories,
      includeFiles,
      respectGitignore: true, // Respect .gitignore by default
    });

    if (!result.success)
      throw new Error(
        `Failed to list files in: ${relPath} - ${result.message} - ${result.error || ''}`,
      );

    // Apply output capping to prevent LLM context bloat
    const cappedFiles = capToolOutput(result.files || [], {
      maxBytes: TOOL_OUTPUT_LIMITS.LIST_FILES.MAX_TOTAL_OUTPUT_SIZE,
      maxItems: TOOL_OUTPUT_LIMITS.LIST_FILES.MAX_RESULTS,
    });

    // Build success message
    const totalItems = result.files?.length || 0;
    let message = `Successfully listed ${totalItems} items in: ${relPath}`;
    if (recursive) {
      message += ` (recursive${maxDepth !== undefined ? `, max depth ${maxDepth}` : ''})`;
    }
    if (pattern) {
      message += ` (filtered by pattern: ${pattern})`;
    }
    message += ` - ${result.totalFiles || 0} files, ${result.totalDirectories || 0} directories`;

    // Add truncation message with helpful suggestions if results were capped
    if (cappedFiles.truncated) {
      const suggestions = [];
      if (recursive)
        suggestions.push(
          'Use recursive: false to list only the immediate directory',
        );

      if (!pattern)
        suggestions.push(
          'Use pattern parameter to filter specific file types (e.g., "*.ts")',
        );

      if (maxDepth === undefined && recursive)
        suggestions.push(
          'Use maxDepth parameter to limit recursion depth (e.g., maxDepth: 2)',
        );

      suggestions.push('Search in a subdirectory instead of the root');

      if (cappedFiles.itemsRemoved)
        message += formatTruncationMessage(
          cappedFiles.itemsRemoved,
          totalItems,
          suggestions,
        );
      else {
        message += TOOL_OUTPUT_LIMITS.DEFAULT_TRUNCATION_MESSAGE;
        message += '\nSuggestions:\n';
        message += suggestions.map((s) => `  - ${s}`).join('\n');
      }
    }

    return {
      message,
      result: {
        files: cappedFiles.result,
        totalFiles: result.totalFiles,
        totalDirectories: result.totalDirectories,
        truncated: cappedFiles.truncated,
        itemsRemoved: cappedFiles.itemsRemoved,
      },
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const listFilesTool = (clientRuntime: ClientRuntime) =>
  tool({
    description: DESCRIPTION,
    inputSchema: listFilesParamsSchema,
    execute: async (args) => {
      return validateToolOutput(
        await listFilesToolExecute(args, clientRuntime),
      );
    },
  });
