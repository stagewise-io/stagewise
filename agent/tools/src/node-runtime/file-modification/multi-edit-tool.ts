import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { FileDiff } from '@stagewise/agent-types';
import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';
import { prepareDiffContent } from '../../utils/file';
import { rethrowCappedToolOutputError } from '../../utils/error';

export const DESCRIPTION = `Make multiple find-and-replace edits to a single file in one operation. CRITICAL: Edits are applied SEQUENTIALLY - each edit sees the results of previous edits.

Parameters:
- relative_path (string, REQUIRED): Relative file path to edit. File must exist.
- edits (array, REQUIRED): Array of edit objects (minimum 1 edit). Each edit contains:
  - old_string (string, REQUIRED): Text to find and replace.
  - new_string (string, REQUIRED): Text to replace it with.
  - replace_all (boolean, OPTIONAL): If true, replaces all occurrences. If false (default), replaces only FIRST occurrence in current content.
      
Behavior: Edits applied in array order. Edit 2 operates on results of edit 1, edit 3 on results of edit 2, etc. If old_string not found in current content, that edit is skipped. Returns total number of individual replacements made.`;

const editSchema = z.object({
  old_string: z.string().describe('Text to find and replace.'),
  new_string: z.string().describe('Text to replace it with.'),
  replace_all: z
    .boolean()
    .optional()
    .describe(
      'If true, replaces all occurrences. If false (default), replaces only FIRST occurrence in current content.',
    ),
});

export const multiEditParamsSchema = z.object({
  relative_path: z
    .string()
    .describe('Relative file path to edit. File must exist.'),
  edits: z
    .array(editSchema)
    .min(1)
    .describe('Array of edit objects (minimum 1 edit).'),
});

export type MultiEditParams = z.infer<typeof multiEditParamsSchema>;

/**
 * MultiEdit tool for making multiple edits to a single file
 * - Applies multiple find-and-replace operations efficiently
 * - Each edit can replace a single occurrence or all occurrences
 * - Edits are applied sequentially in the order provided
 * - More efficient than multiple single-edit operations
 */
export async function multiEditToolExecute(
  params: MultiEditParams,
  clientRuntime: ClientRuntime,
) {
  const { relative_path, edits } = params;

  if (edits.length === 0)
    throw new Error(
      `Missing required parameter: edits (must contain at least one edit)`,
    );

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(relative_path);

    // Check if file exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) throw new Error(`File does not exist: ${relative_path}`);

    // Read the current file content
    const readResult = await clientRuntime.fileSystem.readFile(absolutePath);
    if (!readResult.success || !readResult.content)
      throw new Error(
        `Failed to read file before edit: ${relative_path} - ${readResult.message} - ${readResult.error || ''}`,
      );

    // Store the original content for undo capability
    const originalContent = readResult.content;

    let content = readResult.content;
    let totalEditsApplied = 0;

    // Apply each edit sequentially
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (!edit) continue; // Skip if edit is undefined (should not happen after validation)

      const { old_string, new_string, replace_all = false } = edit;

      // Count occurrences before replacement
      const occurrences = content.split(old_string).length - 1;

      if (occurrences === 0) continue;

      // Apply the replacement
      if (replace_all) {
        // Replace all occurrences
        content = content.split(old_string).join(new_string);
        totalEditsApplied += occurrences;
      } else {
        // Replace only the first occurrence
        const index = content.indexOf(old_string);
        if (index !== -1) {
          content =
            content.substring(0, index) +
            new_string +
            content.substring(index + old_string.length);
          totalEditsApplied += 1;
        }
      }
    }

    // Write the modified content back to the file
    if (totalEditsApplied === 0)
      return {
        message: `Applied 0 edits to ${relative_path}.`,
        result: {
          editsApplied: totalEditsApplied,
        },
        hiddenMetadata: {
          undoExecute: async () => {},
          diff: undefined,
        },
      };

    const writeResult = await clientRuntime.fileSystem.writeFile(
      absolutePath,
      content,
    );
    if (!writeResult.success)
      throw new Error(
        `Failed to write file: ${relative_path} - ${writeResult.message} - ${writeResult.error || ''}`,
      );

    // Create the undo function to restore the original content
    const undoExecute = async (): Promise<void> => {
      const restoreResult = await clientRuntime.fileSystem.writeFile(
        absolutePath,
        originalContent,
      );

      if (!restoreResult.success)
        throw new Error(
          `Failed to restore original content for file: ${relative_path} - ${restoreResult.message} - ${restoreResult.error || ''}`,
        );
    };

    // Prepare content for diff (check for binary/large files)
    const beforePrepared = await prepareDiffContent(
      originalContent,
      absolutePath,
      clientRuntime,
    );
    const afterPrepared = await prepareDiffContent(
      content,
      absolutePath,
      clientRuntime,
    );

    // Create diff data based on discriminated union
    let diff: FileDiff;
    if (!beforePrepared.omitted && !afterPrepared.omitted) {
      diff = {
        path: relative_path,
        before: beforePrepared.content!,
        after: afterPrepared.content!,
      };
    } else if (!beforePrepared.omitted && afterPrepared.omitted) {
      diff = {
        path: relative_path,
        before: beforePrepared.content!,
        after: null,
      };
    } else if (beforePrepared.omitted && !afterPrepared.omitted) {
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

    return {
      message: `Successfully applied ${totalEditsApplied} edits to ${relative_path}`,
      result: { editsApplied: totalEditsApplied },
      hiddenMetadata: {
        undoExecute,
        diff,
      },
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const multiEditTool = (clientRuntime: ClientRuntime) =>
  tool({
    name: 'multiEditTool',
    description: DESCRIPTION,
    inputSchema: multiEditParamsSchema,
    execute: async (args) => {
      return validateToolOutput(
        await multiEditToolExecute(args, clientRuntime),
      );
    },
  });
