import type { CopyToolInput } from '@shared/karton-contracts/ui/agent/tools/types';
import {
  rethrowCappedToolOutputError,
  type MountedClientRuntimes,
} from '../../utils';
import { resolveMountedRelativePath } from '../../utils/path-mounting';
import fs from 'node:fs/promises';
import path from 'node:path';

export const DESCRIPTION = `Copy or move a file or directory. Use this to rename files or directories by moving them. Throws error if source doesn't exist or if trying to copy a directory into an existing file.`;

/**
 * Recursively copy a directory from source to destination.
 */
async function copyDirectoryRecursive(
  src: string,
  dest: string,
): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Copy/move tool execute function.
 *
 * Note: Diff-history tracking is handled by the ToolboxService custom wrapper,
 * NOT by wrapFileModifyingTool (since this tool involves two paths).
 */
export async function copyToolExecute(
  params: CopyToolInput,
  mountedRuntimes: MountedClientRuntimes,
): Promise<{ message: string }> {
  const { input_path, output_path, move } = params;

  const { clientRuntime: srcRuntime, path: srcRelative } =
    resolveMountedRelativePath(mountedRuntimes, input_path);
  const { clientRuntime: destRuntime, path: destRelative } =
    resolveMountedRelativePath(mountedRuntimes, output_path);

  try {
    const srcAbsolute = srcRuntime.fileSystem.resolvePath(srcRelative);
    const destAbsolute = destRuntime.fileSystem.resolvePath(destRelative);

    // Check source exists
    const srcExists = await srcRuntime.fileSystem.fileExists(srcAbsolute);
    const srcIsDir = await srcRuntime.fileSystem.isDirectory(srcAbsolute);
    if (!srcExists && !srcIsDir)
      throw new Error(`Source not found: ${input_path}`);

    if (srcIsDir) {
      // Cannot copy directory into an existing file
      const destExists = await destRuntime.fileSystem.fileExists(destAbsolute);
      const destIsDir = await destRuntime.fileSystem.isDirectory(destAbsolute);
      if (destExists && !destIsDir)
        throw new Error(
          `Cannot copy directory into existing file: ${output_path}`,
        );

      // Copy directory recursively
      await copyDirectoryRecursive(srcAbsolute, destAbsolute);

      // If move, remove the source directory
      if (move) {
        await fs.rm(srcAbsolute, { recursive: true, force: true });
      }
    } else {
      // File copy/move
      // If dest is an existing directory, copy into it with the same filename
      const destIsDir = await destRuntime.fileSystem.isDirectory(destAbsolute);
      let finalDest = destAbsolute;
      if (destIsDir) {
        const srcBaseName = path.basename(srcAbsolute);
        finalDest = path.join(destAbsolute, srcBaseName);
      }

      // Ensure parent directory exists
      const parentDir = path.dirname(finalDest);
      await fs.mkdir(parentDir, { recursive: true });

      if (move) {
        // Try rename first (fastest, works within same filesystem)
        try {
          await fs.rename(srcAbsolute, finalDest);
        } catch {
          // Cross-filesystem: copy then delete
          await fs.copyFile(srcAbsolute, finalDest);
          await fs.unlink(srcAbsolute);
        }
      } else {
        await fs.copyFile(srcAbsolute, finalDest);
      }
    }

    const action = move ? 'Moved' : 'Copied';
    return {
      message: `${action} ${srcIsDir ? 'directory' : 'file'}: ${input_path} → ${output_path}`,
    };
  } catch (e) {
    rethrowCappedToolOutputError(e);
  }
}
