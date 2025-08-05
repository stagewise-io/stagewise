import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { z } from 'zod';
import { checkFileSize } from './file-utils';
import { FILE_SIZE_LIMITS } from './constants';

export const DESCRIPTION = 'Make a single find-and-replace edit to a file';

export const singleLineEditParamsSchema = z.object({
  file_path: z.string().describe('Relative file path'),
  old_string: z.string().describe('The text to replace'),
  new_string: z.string().describe('The text to replace it with'),
  replace_all: z
    .boolean()
    .optional()
    .describe('Replace all occurrences (default: false)'),
});

export type SingleLineEditParams = z.infer<typeof singleLineEditParamsSchema>;

const toolResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  editsApplied: z.number().optional(),
  error: z.string().optional(),
});

type ToolResult = z.infer<typeof toolResultSchema>;

/**
 * SingleLineEdit tool for making a single find-and-replace edit to a file
 * - Applies one find-and-replace operation
 * - Can replace a single occurrence or all occurrences
 * - Efficient for single string replacements
 */
export async function singleLineEditTool(
  params: SingleLineEditParams,
  clientRuntime: ClientRuntime,
): Promise<ToolResult> {
  const { file_path, old_string, new_string, replace_all } = params;

  // Validate required parameters
  if (!file_path) {
    return {
      success: false,
      message: 'Missing required parameter: file_path',
      error: 'MISSING_FILE_PATH',
    };
  }

  if (!old_string || !new_string) {
    return {
      success: false,
      message: 'Missing required parameter: old_string or new_string',
      error: 'MISSING_OLD_STRING_OR_NEW_STRING',
    };
  }

  if (old_string === new_string) {
    return {
      success: false,
      message: 'old_string and new_string cannot be the same',
      error: 'INVALID_EDIT',
    };
  }

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(file_path);

    // Check if file exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) {
      return {
        success: false,
        message: `File does not exist: ${file_path}`,
        error: 'FILE_NOT_FOUND',
      };
    }

    // Check file size before reading
    const sizeCheck = await checkFileSize(
      clientRuntime,
      absolutePath,
      FILE_SIZE_LIMITS.EDIT_MAX_FILE_SIZE,
    );

    if (!sizeCheck.isWithinLimit) {
      return {
        success: false,
        message: sizeCheck.error || `File is too large to edit: ${file_path}`,
        error: 'FILE_TOO_LARGE',
      };
    }

    // Log file size if available
    if (sizeCheck.fileSize !== undefined) {
      console.log(
        `[singleLineEditTool] Editing file ${file_path} (${sizeCheck.fileSize} bytes)`,
      );
    }

    // Read the current file content
    const readResult = await clientRuntime.fileSystem.readFile(absolutePath);
    if (!readResult.success || !readResult.content) {
      return {
        success: false,
        message: `Failed to read file: ${file_path}`,
        error: readResult.error || 'READ_ERROR',
      };
    }

    let content = readResult.content;
    let totalEditsApplied = 0;

    // Count occurrences before replacement
    const occurrences = content.split(old_string).length - 1;

    if (occurrences === 0) {
      console.log(
        `[singleLineEditTool] No occurrences of "${old_string}" found`,
      );
      return {
        success: true,
        message: `No occurrences of "${old_string}" found in ${file_path}`,
        editsApplied: 0,
      };
    }

    // Apply the replacement
    if (replace_all) {
      // Replace all occurrences
      content = content.split(old_string).join(new_string);
      totalEditsApplied = occurrences;
      console.log(`[singleLineEditTool] Replaced ${occurrences} occurrences`);
    } else {
      // Replace only the first occurrence
      const index = content.indexOf(old_string);
      if (index !== -1) {
        content =
          content.substring(0, index) +
          new_string +
          content.substring(index + old_string.length);
        totalEditsApplied = 1;
        console.log(`[singleLineEditTool] Replaced 1 occurrence`);
      }
    }

    // Write the modified content back to the file
    if (totalEditsApplied > 0) {
      const writeResult = await clientRuntime.fileSystem.writeFile(
        absolutePath,
        content,
      );
      if (!writeResult.success) {
        return {
          success: false,
          message: `Failed to write file: ${file_path}`,
          error: writeResult.error || 'WRITE_ERROR',
        };
      }
    }

    return {
      success: true,
      message: `Successfully applied ${totalEditsApplied} edit${totalEditsApplied === 1 ? '' : 's'} to ${file_path}`,
      editsApplied: totalEditsApplied,
    };
  } catch (error) {
    return {
      success: false,
      message: `SingleLineEdit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
