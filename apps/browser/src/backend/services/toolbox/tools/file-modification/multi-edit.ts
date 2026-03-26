import {
  type MultiEditToolInput,
  multiEditToolInputSchema,
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
export const DESCRIPTION = `Make multiple find-and-replace edits to a single file in one operation. CRITICAL: Edits are applied SEQUENTIALLY - each edit sees the results of previous edits.

Parameters:
- path (string, REQUIRED): Relative file path to edit. File must exist. Must include a mount prefix, e.g. "w1/src/app.ts" or "apps/my-app/index.html".
- edits (array, REQUIRED): Array of edit objects (minimum 1 edit). Each edit contains:
  - old_string (string, REQUIRED): Text to find and replace.
  - new_string (string, REQUIRED): Text to replace it with.
  - replace_all (boolean, OPTIONAL): If true, replaces all occurrences. If false (default), replaces only FIRST occurrence in current content.
      
Behavior: Edits applied in array order. Edit 2 operates on results of edit 1, edit 3 on results of edit 2, etc. If old_string not found in current content, that edit is skipped. Returns total number of individual replacements made.`;

/**
 * MultiEdit tool for making multiple edits to a single file
 * - Applies multiple find-and-replace operations efficiently
 * - Each edit can replace a single occurrence or all occurrences
 * - Edits are applied sequentially in the order provided
 * - More efficient than multiple single-edit operations
 *
 * Note: Diff-history tracking is handled by the ToolboxService wrapper.
 */
export async function multiEditToolExecute(
  params: MultiEditToolInput,
  mountedRuntimes: MountedClientRuntimes,
) {
  const { clientRuntime, path } = resolveMountedRelativePath(
    mountedRuntimes,
    params.path,
  );
  const { edits } = params;

  if (edits.length === 0)
    throw new Error(
      `Missing required parameter: edits (must contain at least one edit)`,
    );

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(path);

    // Check if file exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) throw new Error(`File does not exist: ${path}`);

    // Read the current file content
    const readResult = await clientRuntime.fileSystem.readFile(absolutePath);
    if (!readResult.success || !readResult.content)
      throw new Error(
        `Failed to read file before edit: ${path} - ${readResult.message} - ${readResult.error || ''}`,
      );

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

    // If no edits applied, return early without writing
    if (totalEditsApplied === 0)
      return {
        message: `Applied 0 edits to ${path}.`,
        result: {
          editsApplied: totalEditsApplied,
        },
      };

    // Write the modified content back to the file
    const writeResult = await clientRuntime.fileSystem.writeFile(
      absolutePath,
      content,
    );
    if (!writeResult.success)
      throw new Error(
        `Failed to write file: ${path} - ${writeResult.message} - ${writeResult.error || ''}`,
      );

    return {
      message: `Successfully applied ${totalEditsApplied} edits`,
      result: { editsApplied: totalEditsApplied },
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const multiEdit = (mountedRuntimes: MountedClientRuntimes) =>
  tool({
    description: DESCRIPTION,
    inputSchema: multiEditToolInputSchema,
    strict: true,
    execute: async (args) => {
      return multiEditToolExecute(args, mountedRuntimes);
    },
  });
