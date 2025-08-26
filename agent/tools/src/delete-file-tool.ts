import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { ToolResult, FileDeleteDiff } from '@stagewise/agent-types';
import { z } from 'zod';
import { prepareDiffContent } from './file-utils';

export const DESCRIPTION = 'Delete a file from the file system';

export const deleteFileParamsSchema = z.object({
  path: z.string().describe('Relative file path to delete'),
});

export type DeleteFileParams = z.infer<typeof deleteFileParamsSchema>;

/**
 * Delete file tool
 * Removes a file from the file system.
 * Returns an error if the file doesn't exist or cannot be deleted.
 */
export async function deleteFileTool(
  params: DeleteFileParams,
  clientRuntime: ClientRuntime,
): Promise<ToolResult> {
  const { path: relPath } = params;

  // Validate required parameters
  if (!relPath) {
    return {
      success: false,
      message: 'Missing required parameter: path',
      error: 'MISSING_PATH',
    };
  }

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(relPath);

    // Check if file exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) {
      return {
        success: false,
        message: `File not found: ${relPath}`,
        error: 'FILE_NOT_FOUND',
      };
    }

    // Read the file content before deletion for undo capability
    const originalContent =
      await clientRuntime.fileSystem.readFile(absolutePath);
    if (!originalContent.success || originalContent.content === undefined) {
      return {
        success: false,
        message: `Failed to read file before deletion: ${relPath}`,
        error: 'READ_ERROR',
      };
    }

    // Store the original content for undo
    const fileContent = originalContent.content;

    // Prepare content for diff (check for binary/large files)
    const preparedContent = await prepareDiffContent(
      fileContent,
      absolutePath,
      clientRuntime,
    );

    // Delete the file
    const deleteResult =
      await clientRuntime.fileSystem.deleteFile(absolutePath);
    if (!deleteResult.success) {
      return {
        success: false,
        message: `Failed to delete file: ${relPath}`,
        error: deleteResult.error || 'DELETE_ERROR',
      };
    }

    // Create the undo function
    const undoExecute = async (): Promise<void> => {
      // Ensure directory exists
      const dir = clientRuntime.fileSystem.getDirectoryName(absolutePath);
      await clientRuntime.fileSystem.createDirectory(dir);

      // Restore the file with its original content
      const restoreResult = await clientRuntime.fileSystem.writeFile(
        absolutePath,
        fileContent,
      );

      if (!restoreResult.success) {
        throw new Error(`Failed to restore deleted file: ${relPath}`);
      }
    };

    // Create diff data based on discriminated union
    const diff: FileDeleteDiff = preparedContent.omitted
      ? {
          path: relPath,
          changeType: 'delete',
          truncated: preparedContent.truncated,
          omitted: true,
          contentSize: preparedContent.contentSize,
        }
      : {
          path: relPath,
          changeType: 'delete',
          before: preparedContent.content!,
          truncated: preparedContent.truncated,
          omitted: false,
          contentSize: preparedContent.contentSize,
        };

    return {
      success: true,
      message: `Successfully deleted file: ${relPath}`,
      undoExecute,
      diff,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to delete file: ${relPath}`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
