import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';
import { checkFileSize } from '../../utils/file';
import { FILE_SIZE_LIMITS, TOOL_OUTPUT_LIMITS } from '../../constants';
import { capToolOutput } from '../../utils/tool-output-capper';
import { rethrowCappedToolOutputError } from '../../utils/error';

export const DESCRIPTION = `Read file contents with optional line range control. Line numbers are 1-indexed (first line is 1, not 0).

Behavior: Returns content with totalLines count. Output capped at 200KB (~50k tokens, ~6k lines of code). If truncated, suggests reading in chunks using line ranges. Respects .gitignore.`;

export const readFileParamsSchema = z.object({
  relative_path: z
    .string()
    .describe('Relative path of file to read. File must exist.'),
  start_line: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Starting line number (1-indexed, INCLUSIVE). Must be >= 1. Omit to read from beginning.',
    ),
  end_line: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Ending line number (1-indexed, INCLUSIVE). Must be >= start_line. Omit to read to end.',
    ),
  explanation: z
    .string()
    .describe('One sentence explaining why this tool is being used.'),
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
  const { relative_path, start_line, end_line } = params;

  // Validate line range when not reading entire file
  if (
    start_line !== undefined &&
    end_line !== undefined &&
    start_line > end_line
  )
    throw new Error(`end_line must be equal or larger than start_line`);

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(relative_path);

    // Check if file exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) throw new Error(`File does not exist: ${relative_path}`);

    // Check file size before reading (only when reading entire file)
    if (start_line === undefined && end_line === undefined) {
      const sizeCheck = await checkFileSize(
        clientRuntime,
        absolutePath,
        FILE_SIZE_LIMITS.DEFAULT_MAX_FILE_SIZE,
      );

      if (!sizeCheck.isWithinLimit)
        throw new Error(
          `File is too large to read: ${relative_path} - ${sizeCheck.error || ''}`,
        );
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

    if (!readResult.success)
      throw new Error(
        `Failed to read file: ${relative_path} - ${readResult.message} - ${readResult.error || ''}`,
      );

    const content = readResult.content;
    const totalLines = readResult.totalLines || content?.split('\n').length;
    const linesRead = content?.split('\n').length || 0;

    // Prepare result data
    const resultData = {
      content,
      totalLines,
      linesRead,
    };

    // Apply output capping to prevent LLM context bloat
    const cappedResult = capToolOutput(resultData, {
      maxBytes: TOOL_OUTPUT_LIMITS.READ_FILE.MAX_TOTAL_OUTPUT_SIZE,
    });

    const cappedOutput = {
      ...cappedResult.result,
      truncated: cappedResult.truncated,
      originalSize: cappedResult.originalSize,
      cappedSize: cappedResult.cappedSize,
    };

    // Format the success message
    let message = `Successfully read lines ${start_line || 1}-${end_line || totalLines} from file: ${relative_path} (${linesRead} lines of ${totalLines} total)`;

    // Add truncation message if content was capped
    if (cappedResult.truncated) {
      const suggestions = [
        'Use start_line and end_line parameters to read specific sections of the file',
        'Read the file in multiple smaller chunks',
        'Consider using grep to find specific content first',
      ];

      message += '\n[Content truncated due to size limits]';
      message += `\nOriginal size: ${Math.round(cappedResult.originalSize / 1024)}KB, Capped size: ${Math.round(cappedResult.cappedSize / 1024)}KB`;
      message += '\nTo see all content, try:';
      message += `\n${suggestions.map((s) => `  - ${s}`).join('\n')}`;
    }

    return {
      success: true,
      message,
      result: cappedOutput,
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
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
