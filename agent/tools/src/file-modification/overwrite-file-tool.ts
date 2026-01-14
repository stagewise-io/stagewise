import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { rethrowCappedToolOutputError } from '../utils/error.js';
import { tool } from 'ai';
import { validateToolOutput } from '../index.js';
import type { FileDiff } from '@stagewise/agent-types';
import { z } from 'zod';
import { prepareDiffContent } from '../utils/file.js';
import type { PreparedDiffContent } from '../utils/file.js';

export const DESCRIPTION = `Overwrite entire file content, creating the file if it does not exist.

Parameters:
- relative_path (string, REQUIRED): Relative file path to overwrite or create.
- content (string, REQUIRED): New content for the file. Leading/trailing markdown code block markers (\`\`\`) are automatically removed.

Behavior: Creates parent directories if needed. No size limit on file write itself.`;

export const overwriteFileParamsSchema = z.object({
  relative_path: z
    .string()
    .describe('Relative file path to overwrite or create.'),
  content: z
    .string()
    .describe(
      'New content for the file. Leading/trailing markdown code block markers (```) are automatically removed.',
    ),
});

export type OverwriteFileParams = z.infer<typeof overwriteFileParamsSchema>;

/**
 * Overwrite file content tool
 * Replaces the entire content of a file with new content.
 * Creates directories as needed.
 */
export async function overwriteFileToolExecute(
  params: OverwriteFileParams,
  clientRuntime: ClientRuntime,
) {
  const { relative_path, content } = params;

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(relative_path);

    // Check if file exists and read original content for undo capability
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    let originalContent: string | undefined;
    let beforePrepared: PreparedDiffContent | null = null;

    if (fileExists) {
      const readResult = await clientRuntime.fileSystem.readFile(absolutePath);
      if (!readResult.success || readResult.content === undefined)
        throw new Error(
          `Failed to read existing file: ${relative_path} - ${readResult.message} - ${readResult.error || ''}`,
        );

      originalContent = readResult.content;
      beforePrepared = await prepareDiffContent(
        originalContent,
        absolutePath,
        clientRuntime,
      );
    }

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

    // Create the undo function
    const undoExecute = async (): Promise<void> => {
      if (fileExists && originalContent !== undefined) {
        // File existed before, restore its original content
        const restoreResult = await clientRuntime.fileSystem.writeFile(
          absolutePath,
          originalContent,
        );

        if (!restoreResult.success) {
          throw new Error(
            `Failed to restore original content for file: ${relative_path} - ${restoreResult.message} - ${restoreResult.error || ''}`,
          );
        }
      } else {
        // File didn't exist before, delete it
        const deleteResult =
          await clientRuntime.fileSystem.deleteFile(absolutePath);

        if (!deleteResult.success)
          throw new Error(
            `Failed to delete newly created file: ${relative_path} - ${deleteResult.message} - ${deleteResult.error || ''}`,
          );
      }
    };

    // Build success message
    const action = fileExists ? 'updated' : 'created';
    const message = `Successfully ${action} file: ${relative_path}`;

    // Prepare content for diff (check for binary/large files)
    const afterPrepared = await prepareDiffContent(
      cleanContent,
      absolutePath,
      clientRuntime,
    );

    // Create diff based on discriminated unions
    let diff: FileDiff;

    if (fileExists) {
      // FileModifyDiff - handle 4 cases based on omitted flags
      if (beforePrepared && !beforePrepared.omitted && !afterPrepared.omitted) {
        diff = {
          path: relative_path,
          before: beforePrepared.content!,
          after: afterPrepared.content!,
        };
      } else if (
        beforePrepared &&
        !beforePrepared.omitted &&
        afterPrepared.omitted
      ) {
        diff = {
          path: relative_path,
          before: beforePrepared.content!,
          after: null,
        };
      } else if (beforePrepared?.omitted && !afterPrepared.omitted) {
        diff = {
          path: relative_path,
          before: null,
          after: afterPrepared.content!,
        };
      } else {
        diff = {
          path: relative_path,
          before: null,
          after: null,
        };
      }
    } else {
      // FileCreateDiff - handle 2 cases based on omitted flag
      diff = afterPrepared.omitted
        ? {
            path: relative_path,
            before: null,
            after: null,
          }
        : {
            path: relative_path,
            before: null,
            after: afterPrepared.content!,
          };
    }

    return {
      message,
      hiddenFromLLM: {
        diff,
      },
      nonSerializableMetadata: {
        undoExecute,
      },
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const overwriteFileTool = (clientRuntime: ClientRuntime) =>
  tool({
    description: DESCRIPTION,
    inputSchema: overwriteFileParamsSchema,
    execute: async (args) => {
      return validateToolOutput(
        await overwriteFileToolExecute(args, clientRuntime),
      );
    },
  });
