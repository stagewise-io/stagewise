import {
  type WriteToolInput,
  writeToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import {
  type MountedClientRuntimes,
  rethrowCappedToolOutputError,
} from '../../utils';
import { resolveMountedRelativePath } from '../../utils/path-mounting';

export const DESCRIPTION = `Write content to a file. Overrides existing file contents. Creates parent directories if needed.`;

/**
 * Overwrite file content tool
 * Replaces the entire content of a file with new content.
 * Creates directories as needed.
 *
 * Note: Diff-history tracking is handled by the ToolboxService wrapper.
 */
export async function writeToolExecute(
  params: WriteToolInput,
  mountedRuntimes: MountedClientRuntimes,
) {
  const { clientRuntime, path } = resolveMountedRelativePath(
    mountedRuntimes,
    params.path,
  );
  const { content } = params;

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(path);

    // Check if file exists (for message)
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);

    // Clean up content - remove markdown code blocks if present
    // TODO: Do we still need this or are llm smart enough to handle this now?
    let cleanContent = content;
    if (cleanContent.startsWith('```')) {
      const lines = cleanContent.split('\n');
      // Remove first line if it's a code block marker
      if (lines[0]?.trim().startsWith('```')) {
        lines.shift();
      }
      cleanContent = lines.join('\n');
    }
    if (cleanContent.endsWith('```')) {
      const lines = cleanContent.split('\n');
      // Remove last line if it's a code block marker
      if (lines[lines.length - 1]?.trim() === '```') {
        lines.pop();
      }
      cleanContent = lines.join('\n');
    }

    // Ensure directory exists
    const dir = clientRuntime.fileSystem.getDirectoryName(absolutePath);
    await clientRuntime.fileSystem.createDirectory(dir);

    // Write the file
    const writeResult = await clientRuntime.fileSystem.writeFile(
      absolutePath,
      cleanContent,
    );
    if (!writeResult.success)
      throw new Error(
        `Failed to write file: ${path} - ${writeResult.message} - ${writeResult.error || ''}`,
      );

    // Build success message
    const action = fileExists ? 'updated' : 'created';
    let message = `Successfully ${action} file: ${path}`;

    // Add a recommendation when file content is large to help prevent
    // future output-token-limit issues with overwriteFile tool calls.
    const contentLengthChars = cleanContent.length;
    if (contentLengthChars > 4000) {
      message +=
        `\n\n⚠️ Large file write (${contentLengthChars} chars). ` +
        'Prefer incremental edits rather than making large changes like this again.';
    }

    return {
      message,
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const write = (mountedRuntimes: MountedClientRuntimes) =>
  tool({
    description: DESCRIPTION,
    inputSchema: writeToolInputSchema,
    strict: true,
    execute: async (args) => {
      return writeToolExecute(args, mountedRuntimes);
    },
  });
