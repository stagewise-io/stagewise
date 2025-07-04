import { z } from 'zod';

// 1. DEFINE ALL TYPES AND SCHEMAS
export const pendingToolCallSchema = z.object({
  toolName: z.string(),
});

export type PendingToolCall = z.infer<typeof pendingToolCallSchema>;

export const toolCallResultSchema = z.object({
  toolName: z.string(),
});

export type ToolCallResult = z.infer<typeof toolCallResultSchema>;

export const toolSchema = z.object({
  toolName: z.string().min(4).max(32),
  description: z.string().min(4).max(64),
  parameters: z.object({}), // This is a JSON Schema, because we cant send Zod schemas
});

export type Tool = z.infer<typeof toolSchema>;

export const toolListSchema = z.array(toolSchema);

export type ToolList = z.infer<typeof toolListSchema>;
