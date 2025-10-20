import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';
import { checkFileSize } from '../../utils/file';
import { FILE_SIZE_LIMITS } from '../../constants';

export const DESCRIPTION =
  'Read the contents of a file with line-by-line control';

export const readFileParamsSchema = z.object({
  target_file: z.string().describe('Relative path of the file to read'),
  start_line: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Starting line number (first file line is value 1). Omit if tool should read from file start.',
    ),
  end_line: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Ending line number (first file line is value 1). Must be larger than `start_line`. Includes the last line. Omit if tool should read to file end.',
    ),
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
export async function readFileToolExecute(
  params: ReadFileParams,
  clientRuntime: ClientRuntime,
) {
  const { target_file, start_line, end_line } = params;

  // Validate required parameters
  if (!target_file) {
    return {
      success: false,
      message: 'Missing required parameter: target_file',
      error: 'MISSING_TARGET_FILE',
    };
  }

  // Validate line range when not reading entire file
  if (
    start_line !== undefined &&
    end_line !== undefined &&
    start_line > end_line
  ) {
    return {
      success: false,
      message: 'end_line must be equal or larger than start_line',
      error: 'INVALID_LINE_NUMBERS',
    };
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
    if (start_line === undefined && end_line === undefined) {
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
    const readOptions = {
      startLine: start_line,
      endLine: end_line,
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

    const linesRead = content?.split('\n').length || 0;
    const message = `Successfully read lines ${start_line}-${end_line} from file: ${target_file} (${linesRead} lines of ${totalLines} total)`;

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

export const readFileTool = (clientRuntime: ClientRuntime) =>
  tool({
    name: 'readFileTool',
    description: DESCRIPTION,
    inputSchema: readFileParamsSchema,
    execute: async (args) => {
      return validateToolOutput(await readFileToolExecute(args, clientRuntime));
    },
  });
