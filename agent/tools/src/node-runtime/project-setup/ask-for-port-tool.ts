import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION =
  'Ask the user for the port of the app under development';

export const askForPortParamsSchema = z.object({
  userInput: z.object({
    suggestedAppPort: z
      .number()
      .describe(
        "The port you think the USER's app is running on - leave empty if you don't have a suggestion",
      )
      .optional(),
  }),
});

export const askForPortOutputSchema = z.object({
  port: z.number().describe('The port that the USER provided'),
});

export type AskForPortOutput = z.infer<typeof askForPortOutputSchema>;

export type AskForPortParams = z.infer<typeof askForPortParamsSchema>;

export const askForPortTool = (_clientRuntime: ClientRuntime) =>
  tool({
    name: 'askForPortTool',
    description: DESCRIPTION,
    inputSchema: askForPortParamsSchema,
    outputSchema: askForPortOutputSchema,
  });
