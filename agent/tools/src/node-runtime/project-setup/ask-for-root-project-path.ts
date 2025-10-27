import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION =
  'Ask the user to pick the root project path from the open project. Might be open_path if the user opened the root of the project.';

export const askForRootProjectPathParamsSchema = z.object({
  userInput: z.object({
    suggestedPath: z
      .string()
      .describe(
        'The root project path you discovered that the USER should confirm.',
      ),
  }),
});

export const askForRootProjectPathOutputSchema = z.object({
  path: z.string().describe('The root project path that the USER confirmed'),
});

export type AskForRootProjectPathOutput = z.infer<
  typeof askForRootProjectPathOutputSchema
>;

export type AskForRootProjectPathParams = z.infer<
  typeof askForRootProjectPathParamsSchema
>;

export const askForRootProjectPathTool = (_clientRuntime: ClientRuntime) =>
  tool({
    name: 'askForRootProjectPathTool',
    description: DESCRIPTION,
    inputSchema: askForRootProjectPathParamsSchema,
    outputSchema: askForRootProjectPathOutputSchema,
  });
