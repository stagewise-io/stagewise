import type { Tools } from '@stagewise/agent-types';
import { zodSchema } from 'ai';
import { z } from 'zod';

/**
 * Maps Zod schema tools to JSON schema format for the API
 */
export function mapZodToolsToJsonSchemaTools(
  tools: Tools,
): Record<string, { description: string; parameters: any }> {
  return Object.entries(tools).reduce(
    (acc, [key, value]) => {
      acc[key] = {
        description: value.description ?? `Tool: ${key}`,
        parameters:
          value.inputSchema instanceof z.ZodObject
            ? zodSchema(value.inputSchema)
            : value.inputSchema,
      };
      return acc;
    },
    {} as Record<string, { description: string; parameters: any }>,
  );
}
