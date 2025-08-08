import { z } from 'zod';

export const undoRequestSchema = z.object({});

export type UndoRequest = z.infer<typeof undoRequestSchema>;

export const undoExecuteResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export type UndoExecuteResult = z.infer<typeof undoExecuteResultSchema>;
