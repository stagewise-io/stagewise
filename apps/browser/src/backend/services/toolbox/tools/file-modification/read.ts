import {
  type readToolInput,
  readToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import {
  rethrowCappedToolOutputError,
  type MountedClientRuntimes,
} from '../../utils';
import { resolveMountedRelativePath } from '../../utils/path-mounting';

export const DESCRIPTION = `Read metadata and contents of a file. Equals \`cat\` / \`echo\` in bash. For directories, use \`ls\` instead.
If the file is not in context after the tool call, this **ALWAYS** implies that the file has **NOT** changed since the last read that is already in your context!
Large files are truncated to a dynamic token budget. To read a large file efficiently, issue multiple parallel read calls with non-overlapping \`start_line\`/\`end_line\` ranges.`;

/**
 * Read tool
 */
export async function readToolExecute(
  params: readToolInput,
  mountedRuntimes: MountedClientRuntimes,
) {
  const { clientRuntime, path } = resolveMountedRelativePath(
    mountedRuntimes,
    params.path,
  );
  const { start_line, end_line, start_page, end_page } = params;

  // Validate line range when not reading entire file
  if (
    start_line !== undefined &&
    end_line !== undefined &&
    start_line > end_line
  )
    throw new Error(`end_line must be equal or larger than start_line`);

  if (
    start_page !== undefined &&
    end_page !== undefined &&
    start_page > end_page
  )
    throw new Error(`end_page must be equal or larger than start_page`);

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(path);

    // Check if file exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) {
      throw new Error(`File or directory does not exist or is not accessible`);
    }

    // File is valid and within limits. Actual content is injected into
    // model context by the pathReferences pipeline at the next step
    // boundary — we return a confirmation so the agent knows the
    // read was accepted.
    return { message: 'File opened and loaded into context.' };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const readFile = (mountedRuntimes: MountedClientRuntimes) =>
  tool({
    description: DESCRIPTION,
    inputSchema: readToolInputSchema,
    strict: false,
    execute: async (args) => {
      return readToolExecute(args, mountedRuntimes);
    },
  });
