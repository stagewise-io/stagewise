import {
  type DeleteFileToolInput,
  deleteFileToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import {
  rethrowCappedToolOutputError,
  type MountedClientRuntimes,
} from '../../utils';
import { resolveMountedRelativePath } from '../../utils/path-mounting';

/* Due to an issue in zod schema conversion in the ai sdk,
   the schema descriptions are not properly used for the prompts -
   thus, we include them in the descriptions as well. */
export const DESCRIPTION = `Delete a file from the file system with undo capability.

Parameters:
- relative_path (string, REQUIRED): Relative file path to delete. Must be an existing file. Must include a mount prefix, e.g. "w1/src/app.ts" or "apps/my-app/index.html".

Behavior: Respects .gitignore. Throws error if file doesn't exist.`;

/**
 * Delete file tool
 * Removes a file from the file system.
 * Returns an error if the file doesn't exist or cannot be deleted.
 *
 * Note: Diff-history tracking is handled by the ToolboxService wrapper.
 */
export async function deleteFileToolExecute(
  params: DeleteFileToolInput,
  mountedRuntimes: MountedClientRuntimes,
) {
  const { clientRuntime, relativePath } = resolveMountedRelativePath(
    mountedRuntimes,
    params.relative_path,
  );

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(relativePath);

    // Check if file exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) throw new Error(`File not found: ${relativePath}`);

    // Delete the file
    const deleteResult =
      await clientRuntime.fileSystem.deleteFile(absolutePath);
    if (!deleteResult.success)
      throw new Error(
        `Failed to delete file: ${relativePath} - ${deleteResult.message} - ${deleteResult.error || ''}`,
      );

    return {
      message: `Successfully deleted file: ${relativePath}`,
    };
  } catch (e) {
    rethrowCappedToolOutputError(e);
  }
}

export const deleteFile = (mountedRuntimes: MountedClientRuntimes) =>
  tool({
    description: DESCRIPTION,
    inputSchema: deleteFileToolInputSchema,
    strict: true,
    execute: async (args) => {
      return deleteFileToolExecute(args, mountedRuntimes);
    },
  });
