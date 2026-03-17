import {
  type OverwriteFileToolInput,
  overwriteFileToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import {
  type MountedClientRuntimes,
  rethrowCappedToolOutputError,
} from '../../utils';
import { resolveMountedRelativePath } from '../../utils/path-mounting';

/* Due to an issue in zod schema conversion in the ai sdk,
   the schema descriptions are not properly used for the prompts -
   thus, we include them in the descriptions as well. */
export const DESCRIPTION = `Overwrite entire file content, creating the file if it does not exist.

Parameters:
- relative_path (string, REQUIRED): Relative file path to overwrite or create. Must include a mount prefix, e.g. "w1/src/app.ts" or "apps/my-app/index.html".
- content (string, REQUIRED): New content for the file. Leading/trailing markdown code block markers (\`\`\`) are automatically removed.

Behavior: Creates parent directories if needed. No size limit on file write itself.`;

/**
 * Overwrite file content tool
 * Replaces the entire content of a file with new content.
 * Creates directories as needed.
 *
 * Note: Diff-history tracking is handled by the ToolboxService wrapper.
 */
export async function overwriteFileToolExecute(
  params: OverwriteFileToolInput,
  mountedRuntimes: MountedClientRuntimes,
) {
  const { clientRuntime, relativePath: relative_path } =
    resolveMountedRelativePath(mountedRuntimes, params.relative_path);
  const { content } = params;

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(relative_path);

    // Check if file exists (for message)
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);

    // Clean up content - remove markdown code blocks if present
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
        `Failed to write file: ${relative_path} - ${writeResult.message} - ${writeResult.error || ''}`,
      );

    // Build success message
    const action = fileExists ? 'updated' : 'created';
    let message = `Successfully ${action} file: ${relative_path}`;

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

export const overwriteFile = (mountedRuntimes: MountedClientRuntimes) =>
  tool({
    description: DESCRIPTION,
    inputSchema: overwriteFileToolInputSchema,
    strict: true,
    execute: async (args) => {
      return overwriteFileToolExecute(args, mountedRuntimes);
    },
  });
