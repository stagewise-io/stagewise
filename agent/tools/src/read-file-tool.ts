import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { ToolResult } from '@stagewise/agent-types';
import { z } from 'zod';
import { checkFileSize } from './file-utils';
import { FILE_SIZE_LIMITS } from './constants';

export const DESCRIPTION =
  'Read the contents of a file with line-by-line control';

export const readFileParamsSchema = z.object({
  target_file: z.string().describe('Relative path of the file to read'),
  should_read_entire_file: z
    .boolean()
    .describe('Whether to read the entire file'),
  start_line_one_indexed: z
    .number()
    .int()
    .min(1)
    .describe('Starting line number (1-indexed)'),
  end_line_one_indexed_inclusive: z
    .number()
    .int()
    .min(1)
    .describe('Ending line number (1-indexed, inclusive)'),
  explanation: z
    .string()
    .describe('One sentence explanation of why this tool is being used'),
});

export type ReadFileParams = z.infer<typeof readFileParamsSchema>;

/**
 * Read content from a file tool
 * - When should_read_entire_file is true: reads the entire file, ignoring line parameters
 * - When should_read_entire_file is false: reads the specified line range (1-indexed, inclusive)
 * - Returns line count information for context
 */
export async function readFileTool(
  params: ReadFileParams,
  clientRuntime: ClientRuntime,
): Promise<ToolResult> {
  const {
    target_file,
    should_read_entire_file,
    start_line_one_indexed,
    end_line_one_indexed_inclusive,
  } = params;

  // Validate required parameters
  if (!target_file) {
    return {
      success: false,
      message: 'Missing required parameter: target_file',
      error: 'MISSING_TARGET_FILE',
    };
  }

  // Validate line range when not reading entire file
  if (!should_read_entire_file) {
    if (
      !Number.isInteger(start_line_one_indexed) ||
      start_line_one_indexed < 1
    ) {
      return {
        success: false,
        message:
          'start_line_one_indexed must be a positive integer (1-indexed)',
        error: 'INVALID_START_LINE',
      };
    }

    if (
      !Number.isInteger(end_line_one_indexed_inclusive) ||
      end_line_one_indexed_inclusive < 1
    ) {
      return {
        success: false,
        message:
          'end_line_one_indexed_inclusive must be a positive integer (1-indexed)',
        error: 'INVALID_END_LINE',
      };
    }

    if (end_line_one_indexed_inclusive < start_line_one_indexed) {
      return {
        success: false,
        message:
          'end_line_one_indexed_inclusive must be greater than or equal to start_line_one_indexed',
        error: 'INVALID_LINE_RANGE',
      };
    }
  }

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(target_file);

    // Check if file exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) {
      return {
        success: false,
        message: `File does not exist: ${target_file}`,
        error: 'FILE_NOT_FOUND',
      };
    }

    // Check file size before reading (only when reading entire file)
    if (should_read_entire_file) {
      const sizeCheck = await checkFileSize(
        clientRuntime,
        absolutePath,
        FILE_SIZE_LIMITS.DEFAULT_MAX_FILE_SIZE,
      );

      if (!sizeCheck.isWithinLimit) {
        return {
          success: false,
          message:
            sizeCheck.error || `File is too large to read: ${target_file}`,
          error: 'FILE_TOO_LARGE',
        };
      }
    }

    // Read the file
    const readOptions = should_read_entire_file
      ? undefined
      : {
          startLine: start_line_one_indexed,
          endLine: end_line_one_indexed_inclusive,
        };

    const readResult = await clientRuntime.fileSystem.readFile(
      absolutePath,
      readOptions,
    );

    if (!readResult.success) {
      return {
        success: false,
        message: `Failed to read file: ${target_file}`,
        error: readResult.error || 'READ_ERROR',
      };
    }

    const content = readResult.content;
    const totalLines = readResult.totalLines || content?.split('\n').length;

    let message: string;
    if (should_read_entire_file) {
      message = `Successfully read entire file: ${target_file} (${totalLines} lines)`;
    } else {
      const linesRead = content?.split('\n').length || 0;
      message = `Successfully read lines ${start_line_one_indexed}-${end_line_one_indexed_inclusive} from file: ${target_file} (${linesRead} lines of ${totalLines} total)`;
    }

    return {
      success: true,
      message,
      result: {
        content,
        totalLines,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to read file: ${target_file}`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
