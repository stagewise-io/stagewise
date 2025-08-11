import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { ToolResult } from '@stagewise/agent-types';
import { z } from 'zod';

export const DESCRIPTION =
  'Overwrite the entire content of a file. Creates the file if it does not exist, along with any necessary directories.';

export const overwriteFileParamsSchema = z.object({
  path: z.string().describe('Relative file path'),
  content: z.string(),
});

export type OverwriteFileParams = z.infer<typeof overwriteFileParamsSchema>;

/**
 * Overwrite file content tool
 * Replaces the entire content of a file with new content.
 * Creates directories as needed.
 */
export async function overwriteFileTool(
  params: OverwriteFileParams,
  clientRuntime: ClientRuntime,
): Promise<ToolResult> {
  const { path: relPath, content } = params;

  // Validate required parameters
  if (!relPath) {
    return {
      undoExecute: () => Promise.resolve(),
      success: false,
      message: 'Missing required parameter: path',
      error: 'MISSING_PATH',
    };
  }

  if (content === undefined) {
    return {
      undoExecute: () => Promise.resolve(),
      success: false,
      message: 'Missing required parameter: content',
      error: 'MISSING_CONTENT',
    };
  }

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(relPath);

    // Check if file exists and read original content for undo capability
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    let originalContent: string | undefined;

    if (fileExists) {
      const readResult = await clientRuntime.fileSystem.readFile(absolutePath);
      if (!readResult.success || readResult.content === undefined) {
        return {
          undoExecute: () => Promise.resolve(),
          success: false,
          message: `Failed to read existing file: ${relPath}`,
          error: 'READ_ERROR',
        };
      }
      originalContent = readResult.content;
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
    if (!writeResult.success) {
      return {
        undoExecute: () => Promise.resolve(),
        success: false,
        message: `Failed to write file: ${relPath}`,
        error: writeResult.error || 'WRITE_ERROR',
      };
    }

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
            `Failed to restore original content for file: ${relPath}`,
          );
        }
      } else {
        // File didn't exist before, delete it
        const deleteResult =
          await clientRuntime.fileSystem.deleteFile(absolutePath);

        if (!deleteResult.success) {
          throw new Error(`Failed to delete newly created file: ${relPath}`);
        }
      }
    };

    // Build success message
    const action = fileExists ? 'updated' : 'created';
    const message = `Successfully ${action} file: ${relPath}`;

    return {
      success: true,
      message,
      undoExecute,
    };
  } catch (error) {
    return {
      undoExecute: () => Promise.resolve(),
      success: false,
      message: `Failed to overwrite file: ${relPath}`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
