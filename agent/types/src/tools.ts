import type { Tool } from 'ai';
import { z } from 'zod';
import { undoExecuteResultSchema } from '@stagewise/agent-interface/agent';

export type { Tool };

export const stagewiseToolMetadataSchema = z.object({
  requiresUserInteraction: z.boolean().default(false).optional(),
  runtime: z.enum(['client', 'server', 'browser']).default('client').optional(),
  type: z.undefined(),
});

export type StagewiseToolMetadata = z.infer<typeof stagewiseToolMetadataSchema>;

export const undoExecuteSchema = z
  .function()
  .args(z.void())
  .returns(z.promise(undoExecuteResultSchema));

export type UndoExecute = z.infer<typeof undoExecuteSchema>;

export const toolResultSchema = z.object({
  undoExecute: undoExecuteSchema.optional(),
  success: z.boolean(),
  error: z.string().optional(),
  message: z.string().optional(),
  result: z.any().optional(),
});

export type ToolResult = z.infer<typeof toolResultSchema>;

export type Tools = Record<
  string,
  Tool<any, ToolResult> & {
    stagewiseMetadata?: StagewiseToolMetadata;
  }
>;
