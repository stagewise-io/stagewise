import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type {
  ToolResult,
  FileModifyDiff,
  FileCreateDiff,
} from '@stagewise/agent-types';
import { z } from 'zod';
import { prepareDiffContent } from './file-utils';

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
      success: false,
      message: 'Missing required parameter: path',
      error: 'MISSING_PATH',
    };
  }

  if (content === undefined) {
    return {
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

    // Prepare content for diff (check for binary/large files)
    let beforePrepared = null;
    let afterPrepared = null;

    if (fileExists && originalContent) {
      beforePrepared = await prepareDiffContent(
        originalContent,
        absolutePath,
        clientRuntime,
      );
    }

    afterPrepared = await prepareDiffContent(
      cleanContent,
      absolutePath,
      clientRuntime,
    );

    // Create diff based on discriminated unions
    let diff: FileModifyDiff | FileCreateDiff;

    if (fileExists) {
      // FileModifyDiff - handle 4 cases based on omitted flags
      const baseModifyDiff = {
        path: relPath,
        changeType: 'modify' as const,
        beforeTruncated: beforePrepared?.truncated || false,
        afterTruncated: afterPrepared.truncated,
        beforeContentSize: beforePrepared?.contentSize || 0,
        afterContentSize: afterPrepared.contentSize,
      };

      if (!beforePrepared?.omitted && !afterPrepared.omitted) {
        diff = {
          ...baseModifyDiff,
          before: beforePrepared!.content!,
          after: afterPrepared.content!,
          beforeOmitted: false,
          afterOmitted: false,
        };
      } else if (!beforePrepared?.omitted && afterPrepared.omitted) {
        diff = {
          ...baseModifyDiff,
          before: beforePrepared!.content!,
          beforeOmitted: false,
          afterOmitted: true,
        };
      } else if (beforePrepared?.omitted && !afterPrepared.omitted) {
        diff = {
          ...baseModifyDiff,
          after: afterPrepared.content!,
          beforeOmitted: true,
          afterOmitted: false,
        };
      } else {
        diff = {
          ...baseModifyDiff,
          beforeOmitted: true,
          afterOmitted: true,
        };
      }
    } else {
      // FileCreateDiff - handle 2 cases based on omitted flag
      diff = afterPrepared.omitted
        ? {
            path: relPath,
            changeType: 'create',
            truncated: afterPrepared.truncated,
            omitted: true,
            contentSize: afterPrepared.contentSize,
          }
        : {
            path: relPath,
            changeType: 'create',
            after: afterPrepared.content!,
            truncated: afterPrepared.truncated,
            omitted: false,
            contentSize: afterPrepared.contentSize,
          };
    }

    return {
      success: true,
      message,
      undoExecute,
      diff,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to overwrite file: ${relPath}`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
