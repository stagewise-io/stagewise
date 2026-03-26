import {
  type LsToolInput,
  lsToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import {
  rethrowCappedToolOutputError,
  type MountedClientRuntimes,
} from '../../utils';
import { resolveMountedRelativePath } from '../../utils/path-mounting';

export const DESCRIPTION = `List files and directories in a directory path. Equals \`ls\` / \`tree\` in bash. For reading file contents, use \`read\` instead.`;

/**
 * List files tool — lists directory contents
 *
 * Uses the same underlying context-injection mechanism as the read tool.
 * The path is resolved and validated, and the actual content is injected
 * into model context by the pathReferences pipeline.
 */
export async function lsToolExecute(
  params: LsToolInput,
  mountedRuntimes: MountedClientRuntimes,
) {
  const { clientRuntime, path } = resolveMountedRelativePath(
    mountedRuntimes,
    params.path,
  );

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(path);

    // Check if directory exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) {
      throw new Error(`Directory does not exist or is not accessible`);
    }

    // Directory is valid. Actual content is injected into model context by
    // the pathReferences pipeline at the next step boundary.
    return;
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const ls = (mountedRuntimes: MountedClientRuntimes) =>
  tool({
    description: DESCRIPTION,
    inputSchema: lsToolInputSchema,
    strict: true,
    execute: async (args) => {
      return lsToolExecute(args, mountedRuntimes);
    },
  });
