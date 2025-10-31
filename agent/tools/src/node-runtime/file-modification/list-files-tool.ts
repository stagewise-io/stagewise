import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';

export const DESCRIPTION =
  'List files and directories in a path (defaults to current directory). Use "recursive" to include subdirectories, "pattern" to filter by file extension or glob pattern, and "maxDepth" to limit recursion depth.';

export const listFilesParamsSchema = z.object({
  path: z.string().optional(),
  recursive: z.boolean().optional(), // Whether to list files recursively
  maxDepth: z.number().min(0).optional(), // Maximum recursion depth (default: unlimited)
  pattern: z.string().optional(), // File extension (e.g., ".ts") or glob-like pattern
  includeDirectories: z.boolean().optional(), // Whether to include directories in results (default: true)
  includeFiles: z.boolean().optional(), // Whether to include files in results (default: true)
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
    path: relPath = '.',
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

    // Build success message
    let message = `Successfully listed ${result.files?.length || 0} items in: ${relPath}`;
    if (recursive) {
      message += ` (recursive${maxDepth !== undefined ? `, max depth ${maxDepth}` : ''})`;
    }
    if (pattern) {
      message += ` (filtered by pattern: ${pattern})`;
    }
    message += ` - ${result.totalFiles || 0} files, ${result.totalDirectories || 0} directories`;

    return {
      message,
      result: {
        files: result.files,
        totalFiles: result.totalFiles,
        totalDirectories: result.totalDirectories,
      },
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    else throw new Error(`Unknown Error`);
  }
}

export const listFilesTool = (clientRuntime: ClientRuntime) =>
  tool({
    name: 'listFilesTool',
    description: DESCRIPTION,
    inputSchema: listFilesParamsSchema,
    execute: async (args) => {
      return validateToolOutput(
        await listFilesToolExecute(args, clientRuntime),
      );
    },
  });
