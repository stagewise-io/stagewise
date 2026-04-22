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
Large files are truncated to a dynamic token budget. To read a large file efficiently, issue multiple parallel read calls with non-overlapping \`start_line\`/\`end_line\` ranges.

The \`preview\` parameter controls the output format:
- **\`preview: true\`** — Returns a structural outline instead of raw content. For source code files (ts, tsx, js, jsx, py, go, rs, java, c, cpp, cs, rb, php, sh, css), produces an AST-based symbol outline listing functions, classes, interfaces, types, and exports with their signatures and line numbers. For markdown files, produces a heading outline. For other text files, returns a short line-head summary. Small files (≤150 lines / ≤6 KB) are auto-promoted to full content regardless.
- **\`preview: false\` (default)** — Returns the full file content, line-numbered and truncated to budget.`;

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
