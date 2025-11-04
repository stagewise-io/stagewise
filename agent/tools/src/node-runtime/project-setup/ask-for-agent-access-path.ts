import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION =
  'Ask the user to confirm the path that the agent should have access to. Pick the project root path. Relative to the app path (e.g. "../..", or ".").';

export const askForAgentAccessPathParamsSchema = z.object({
  userInput: z.object({
    suggestedPath: z
      .string()
      .describe(
        'The relative project root path that the USER should confirm. Relative to the app path (e.g. "../..", or ".").',
      ),
  }),
  selectedAppPath: z
    .string()
    .describe('The app path that the USER picked before.'),
});

export const askForAgentAccessPathOutputSchema = z.object({
  path: z.string().describe('The project root path that the USER confirmed'),
});

export type AskForAgentAccessPathOutput = z.infer<
  typeof askForAgentAccessPathOutputSchema
>;

export type AskForAgentAccessPathParams = z.infer<
  typeof askForAgentAccessPathParamsSchema
>;

export const askForAgentAccessPathTool = (_clientRuntime: ClientRuntime) =>
  tool({
    name: 'askForAgentAccessPathTool',
    description: DESCRIPTION,
    inputSchema: askForAgentAccessPathParamsSchema,
    outputSchema: askForAgentAccessPathOutputSchema,
  });
