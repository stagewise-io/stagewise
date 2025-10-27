import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION =
  'Ask the user to confirm if they want to integrate stagewise into the dev script of their app. Shows the USER a diff of the dev script before and after the integration.';

export const askForDevScriptIntegrationParamsSchema = z.object({
  userInput: z.object({
    diff: z.object({
      before: z
        .string()
        .describe('The content of the dev script before the integration.'),
      after: z
        .string()
        .describe('The content of the dev script after the integration.'),
    }),
  }),
});

export const askForDevScriptIntegrationOutputSchema = z.object({
  shouldIntegrate: z
    .boolean()
    .describe(
      'Whether the USER wants to integrate stagewise into the dev script of their app.',
    ),
});

export type AskForDevScriptIntegrationOutput = z.infer<
  typeof askForDevScriptIntegrationOutputSchema
>;

export type AskForDevScriptIntegrationParams = z.infer<
  typeof askForDevScriptIntegrationParamsSchema
>;

export const askForDevScriptIntegrationTool = (_clientRuntime: ClientRuntime) =>
  tool({
    name: 'askForDevScriptIntegrationTool',
    description: DESCRIPTION,
    inputSchema: askForDevScriptIntegrationParamsSchema,
    outputSchema: askForDevScriptIntegrationOutputSchema,
  });
