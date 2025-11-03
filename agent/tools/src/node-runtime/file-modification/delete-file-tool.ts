import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { FileDiff } from '@stagewise/agent-types';
import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';
import { prepareDiffContent } from '../../utils/file';

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
export async function deleteFileToolExecute(
  params: DeleteFileParams,
  clientRuntime: ClientRuntime,
) {
  const { path: relPath } = params;

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(relPath);

    // Check if file exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) throw new Error(`File not found: ${relPath}`);

    // Read the file content before deletion for undo capability
    const originalContent =
      await clientRuntime.fileSystem.readFile(absolutePath);
    if (!originalContent.success || originalContent.content === undefined)
      throw new Error(
        `Failed to read file before deletion: ${relPath} - ${originalContent.message} - ${originalContent.error || ''}`,
      );

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
    if (!deleteResult.success)
      throw new Error(
        `Failed to delete file: ${relPath} - ${deleteResult.message} - ${deleteResult.error || ''}`,
      );

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

      if (!restoreResult.success)
        throw new Error(
          `Failed to restore deleted file: ${relPath} - ${restoreResult.message} - ${restoreResult.error || ''}`,
        );
    };

    // Create diff data based on discriminated union
    const diff: FileDiff = preparedContent.omitted
      ? {
          path: relPath,
          before: null,
          after: null,
        }
      : {
          path: relPath,
          before: preparedContent.content!,
          after: null,
        };

    return {
      message: `Successfully deleted file: ${relPath}`,
      hiddenMetadata: {
        undoExecute,
        diff,
      },
    };
  } catch (e) {
    if (e instanceof Error) throw e;
    else throw new Error('Unknown error');
  }
}

export const deleteFileTool = (clientRuntime: ClientRuntime) =>
  tool({
    name: 'deleteFileTool',
    description: DESCRIPTION,
    inputSchema: deleteFileParamsSchema,
    execute: async (args) => {
      return validateToolOutput(
        await deleteFileToolExecute(args, clientRuntime),
      );
    },
  });
