import {
  type ReadFileToolInput,
  readFileToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import { tool } from 'ai';
import {
  rethrowCappedToolOutputError,
  capToolOutput,
  checkFileSize,
  type MountedClientRuntimes,
} from '../../utils';
import { resolveMountedRelativePath } from '../../utils/path-mounting';

/* Due to an issue in zod schema conversion in the ai sdk,
   the schema descriptions are not properly used for the prompts -
   thus, we include them in the descriptions as well. */
export const DESCRIPTION = `Read file contents with optional line range control. Line numbers are 1-indexed (first line is 1, not 0).

Parameters:
- relative_path (string, REQUIRED): Relative path of file to read. File must exist. Must include a mount prefix, e.g. "w1/src/app.ts" or "apps/my-app/index.html".
- start_line (number, OPTIONAL): Starting line number (1-indexed, INCLUSIVE). Must be >= 1. Omit to read from beginning.
- end_line (number, OPTIONAL): Ending line number (1-indexed, INCLUSIVE). Must be >= start_line. Omit to read to end.

Behavior: Returns content with totalLines count. Output capped at 200KB (~50k tokens, ~6k lines of code). If truncated, suggests reading in chunks using line ranges. Respects .gitignore.`;

/**
 * Read content from a file tool
 * - When should_read_entire_file is true: reads the entire file, ignoring line parameters
 * - When should_read_entire_file is false: reads the specified line range (1-indexed, inclusive)
 * - Returns line count information for context
 */
export async function readFileToolExecute(
  params: ReadFileToolInput,
  mountedRuntimes: MountedClientRuntimes,
) {
  const { clientRuntime, relativePath: relative_path } =
    resolveMountedRelativePath(mountedRuntimes, params.relative_path);
  const { start_line, end_line } = params;

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
        10 * 1024 * 1024, // 10MB
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
    const cappedResult = capToolOutput(resultData);

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
      success: true as const,
      message,
      result: cappedOutput,
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const readFile = (mountedRuntimes: MountedClientRuntimes) =>
  tool({
    description: DESCRIPTION,
    inputSchema: readFileToolInputSchema,
    execute: async (args) => {
      return readFileToolExecute(args, mountedRuntimes);
    },
  });
