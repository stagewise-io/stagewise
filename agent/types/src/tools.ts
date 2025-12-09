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
 * Type guard to check if a SharedToolOutput has undoExecute in nonSerializableMetadata
 */
export function hasUndoMetadata(output: any): output is {
  nonSerializableMetadata: { undoExecute: () => Promise<void> };
} {
  return (
    output &&
    typeof output === 'object' &&
    'nonSerializableMetadata' in output &&
    output.nonSerializableMetadata &&
    typeof output.nonSerializableMetadata === 'object' &&
    'undoExecute' in output.nonSerializableMetadata &&
    typeof output.nonSerializableMetadata.undoExecute === 'function'
  );
}

/**
 * Type guard to check if a SharedToolOutput has diff in hiddenFromLLM
 */
export function hasDiffMetadata(
  output: any,
): output is { hiddenFromLLM: { diff: FileDiff } } {
  return (
    output &&
    typeof output === 'object' &&
    'hiddenFromLLM' in output &&
    output.hiddenFromLLM &&
    typeof output.hiddenFromLLM === 'object' &&
    'diff' in output.hiddenFromLLM &&
    output.hiddenFromLLM.diff !== null &&
    output.hiddenFromLLM.diff !== undefined
  );
}
