import { z } from 'zod';
import { promptSnippetSchema } from '@stagewise/api-client';
import { userMessageSchema } from '@stagewise/agent-interface-internal/toolbar';

export const systemPromptConfigSchema = z.object({
  userMessage: userMessageSchema.optional(),
  promptSnippets: z.array(promptSnippetSchema).optional(),
});

export type SystemPromptConfig = z.infer<typeof systemPromptConfigSchema>;
