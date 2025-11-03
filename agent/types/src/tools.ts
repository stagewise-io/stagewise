import type { Tool } from 'ai';
import { z } from 'zod';

export type { Tool };

export const stagewiseToolMetadataSchema = z.object({
  requiresUserInteraction: z.boolean().default(false).optional(),
});

export type StagewiseToolMetadata = z.infer<typeof stagewiseToolMetadataSchema>;

export type FileDiff = {
  path: string;
  before: string | null;
  after: string | null;
};

/**
 * Type guard to check if a SharedToolOutput has undoExecute in hiddenMetadata
 */
export function hasUndoMetadata(output: any): output is {
  hiddenMetadata: { undoExecute: () => Promise<void> };
} {
  return (
    output &&
    typeof output === 'object' &&
    'hiddenMetadata' in output &&
    output.hiddenMetadata &&
    typeof output.hiddenMetadata === 'object' &&
    'undoExecute' in output.hiddenMetadata &&
    typeof output.hiddenMetadata.undoExecute === 'function'
  );
}

/**
 * Type guard to check if a SharedToolOutput has diff in hiddenMetadata
 */
export function hasDiffMetadata(
  output: any,
): output is { hiddenMetadata: { diff: FileDiff } } {
  return (
    output &&
    typeof output === 'object' &&
    'hiddenMetadata' in output &&
    output.hiddenMetadata &&
    typeof output.hiddenMetadata === 'object' &&
    'diff' in output.hiddenMetadata &&
    output.hiddenMetadata.diff !== null &&
    output.hiddenMetadata.diff !== undefined
  );
}
