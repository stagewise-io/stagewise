import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { rethrowCappedToolOutputError } from '../utils/error.js';
import type { FileDiff } from '@stagewise/agent-types';
import { tool } from 'ai';
import { validateToolOutput } from '../index.js';
import { z } from 'zod';
import { prepareDiffContent } from '../utils/file.js';

/* Due to an issue in zod schema conversion in the ai sdk,
   the schema descriptions are not properly used for the prompts -
   thus, we include them in the descriptions as well. */
export const DESCRIPTION = `Delete a file from the file system with undo capability.

Parameters:
- relative_path (string, REQUIRED): Relative file path to delete. Must be an existing file.

Behavior: Respects .gitignore. Throws error if file doesn't exist.`;

export const deleteFileParamsSchema = z.object({
  relative_path: z
    .string()
    .describe('Relative file path to delete. Must be an existing file.'),
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
  const { relative_path } = params;

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(relative_path);

    // Check if file exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) throw new Error(`File not found: ${relative_path}`);

    // Read the file content before deletion for undo capability
    const originalContent =
      await clientRuntime.fileSystem.readFile(absolutePath);
    if (!originalContent.success || originalContent.content === undefined)
      throw new Error(
        `Failed to read file before deletion: ${relative_path} - ${originalContent.message} - ${originalContent.error || ''}`,
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
        `Failed to delete file: ${relative_path} - ${deleteResult.message} - ${deleteResult.error || ''}`,
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
          `Failed to restore deleted file: ${relative_path} - ${restoreResult.message} - ${restoreResult.error || ''}`,
        );
    };

    // Create diff data based on discriminated union
    const diff: FileDiff = preparedContent.omitted
      ? {
          path: relative_path,
          before: null,
          after: null,
        }
      : {
          path: relative_path,
          before: preparedContent.content!,
          after: null,
        };

    return {
      message: `Successfully deleted file: ${relative_path}`,
      hiddenFromLLM: {
        diff,
      },
      nonSerializableMetadata: {
        undoExecute,
      },
    };
  } catch (e) {
    rethrowCappedToolOutputError(e);
  }
}

export const deleteFileTool = (clientRuntime: ClientRuntime) =>
  tool({
    description: DESCRIPTION,
    inputSchema: deleteFileParamsSchema,
    execute: async (args) => {
      return validateToolOutput(
        await deleteFileToolExecute(args, clientRuntime),
      );
    },
  });
