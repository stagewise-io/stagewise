import { z } from 'zod';
import { promptSnippetSchema } from '@stagewise/api-client';
import { userMessageMetadataSchema } from '@stagewise/agent-interface-internal/toolbar';

export const systemPromptConfigSchema = z.object({
  userMessageMetadata: userMessageMetadataSchema.optional(),
  promptSnippets: z.array(promptSnippetSchema).optional(),
});

export type SystemPromptConfig = z.infer<typeof systemPromptConfigSchema>;
