import {
  type MkdirToolInput,
  mkdirToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import {
  rethrowCappedToolOutputError,
  type MountedClientRuntimes,
} from '../../utils';
import { resolveMountedRelativePath } from '../../utils/path-mounting';
import fs from 'node:fs/promises';

export const DESCRIPTION = `Create a directory (and any missing parent directories).

Parameters:
- path (string, REQUIRED): Directory path to create. Must include a valid mount prefix (e.g. "w1/src/components/new-dir", "apps/my-app/assets"). Parent directories are created automatically (mkdir -p behavior).

Behavior: No-op if the directory already exists. Throws if path points to an existing file or if the mount is read-only.`;

/**
 * Make directory tool
 * Creates a directory (and parent directories) on the file system.
 */
export async function mkdirToolExecute(
  params: MkdirToolInput,
  mountedRuntimes: MountedClientRuntimes,
): Promise<{ message: string }> {
  const { clientRuntime, path } = resolveMountedRelativePath(
    mountedRuntimes,
    params.path,
  );

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(path);

    // If it's already a directory, no-op
    const isDir = await clientRuntime.fileSystem.isDirectory(absolutePath);
    if (isDir) {
      return { message: `Directory already exists: ${params.path}` };
    }

    // If a file exists at this path, reject
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (fileExists) {
      throw new Error(
        `A file already exists at ${params.path}. Cannot create directory.`,
      );
    }

    // Create directory (recursive = mkdir -p)
    await fs.mkdir(absolutePath, { recursive: true });

    return { message: `Created directory: ${params.path}` };
  } catch (e) {
    rethrowCappedToolOutputError(e);
  }
}

export const mkdir = (mountedRuntimes: MountedClientRuntimes) =>
  tool({
    description: DESCRIPTION,
    inputSchema: mkdirToolInputSchema,
    strict: true,
    execute: async (args) => {
      return mkdirToolExecute(args, mountedRuntimes);
    },
  });
