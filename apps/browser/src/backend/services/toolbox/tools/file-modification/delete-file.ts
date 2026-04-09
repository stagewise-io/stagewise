import {
  type DeleteToolInput,
  deleteToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import {
  rethrowCappedToolOutputError,
  type MountedClientRuntimes,
} from '../../utils';
import { resolveMountedRelativePath } from '../../utils/path-mounting';
import fs from 'node:fs/promises';
import nodePath from 'node:path';

export const DESCRIPTION = `Delete a file or directory from the file system with undo capability.

Parameters:
- path (string, REQUIRED): Relative file or directory path to delete. Must be an existing file or directory. Must include a mount prefix, e.g. "w1/src/app.ts" or "apps/my-app/index.html".

Behavior: Respects .gitignore. Throws error if file/directory doesn't exist. When deleting a directory, all files and subdirectories inside it are removed recursively.`;

/**
 * Delete file/directory tool
 * Removes a file or directory from the file system.
 * Returns an error if the target doesn't exist or cannot be deleted.
 *
 * Note: Diff-history tracking is handled by the ToolboxService wrapper.
 */
export async function deleteToolExecute(
  params: DeleteToolInput,
  mountedRuntimes: MountedClientRuntimes,
) {
  const { clientRuntime, path } = resolveMountedRelativePath(
    mountedRuntimes,
    params.path,
  );

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(path);
    const mountRoot = nodePath.resolve(
      clientRuntime.fileSystem.getCurrentWorkingDirectory(),
    );
    const resolved = nodePath.resolve(absolutePath);
    if (
      resolved !== mountRoot &&
      !resolved.startsWith(mountRoot + nodePath.sep)
    ) {
      throw new Error('Path traversal not allowed');
    }

    // Check if target exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    const isDir = await clientRuntime.fileSystem.isDirectory(absolutePath);

    if (!fileExists && !isDir) throw new Error(`File or directory not found`);

    if (isDir) {
      // Delete the entire directory recursively
      await fs.rm(absolutePath, { recursive: true, force: true });
      return;
    }

    // Single file deletion
    const deleteResult =
      await clientRuntime.fileSystem.deleteFile(absolutePath);
    if (!deleteResult.success)
      throw new Error(
        `Failed to delete file: ${deleteResult.message} - ${deleteResult.error || ''}`,
      );

    return;
  } catch (e) {
    rethrowCappedToolOutputError(e);
  }
}

export const deleteTool = (mountedRuntimes: MountedClientRuntimes) =>
  tool({
    description: DESCRIPTION,
    inputSchema: deleteToolInputSchema,
    strict: false,
    execute: async (args) => {
      return deleteToolExecute(args, mountedRuntimes);
    },
  });
