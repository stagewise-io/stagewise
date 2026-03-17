import {
  type ListFilesToolInput,
  listFilesToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import {
  rethrowCappedToolOutputError,
  capToolOutput,
  formatTruncationMessage,
  type MountedClientRuntimes,
} from '../../utils';
import { resolveMountedRelativePath } from '../../utils/path-mounting';

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

/**
 * List files and directories tool
 * - Lists files and directories in the specified path
 * - Supports recursive listing with optional depth limits
 * - Supports filtering by file extension or pattern
 * - Returns detailed file information including type and size
 */
export async function listFilesToolExecute(
  params: ListFilesToolInput,
  mountedRuntimes: MountedClientRuntimes,
) {
  const { clientRuntime, relativePath: relPath } = resolveMountedRelativePath(
    mountedRuntimes,
    params.relative_path,
  );
  if (!clientRuntime) throw new Error('Mounted path not found');
  const {
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
      maxBytes: 40 * 1024, // 40KB
      maxItems: 50,
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
        message +=
          '\n[Results truncated due to size limits. Use more specific patterns or filters to narrow your search.]';
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

export const listFiles = (mountedRuntimes: MountedClientRuntimes) =>
  tool({
    description: DESCRIPTION,
    inputSchema: listFilesToolInputSchema,
    execute: async (args) => {
      return listFilesToolExecute(args, mountedRuntimes);
    },
  });
