import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION =
  'Ask the user to pick the app path from the open project. Will be open_path if the project is not a monorepo, otherwise it will be the paths of the apps in the monorepo';

export const askForAppPathParamsSchema = z.object({
  userInput: z.object({
    suggestedPaths: z
      .array(
        z.object({
          absolutePath: z.string(),
          displayName: z
            .string()
            .describe(
              'A short name for the app, e.g., "apps/website", "apps/docs"',
            ),
        }),
      )
      .describe(
        'The app paths the USER can pick from - will be open_path if the project is not a monorepo. The display name is a short name for the app, e.g., "apps/website", "apps/docs" and will be displayed to the user.',
      )
      .min(1),
  }),
});

export const askForAppPathOutputSchema = z.object({
  path: z.string().describe('The app path that the USER picked'),
});

export type AskForAppPathOutput = z.infer<typeof askForAppPathOutputSchema>;

export type AskForAppPathParams = z.infer<typeof askForAppPathParamsSchema>;

export const askForAppPathTool = (_clientRuntime: ClientRuntime) =>
  tool({
    name: 'askForAppPathTool',
    description: DESCRIPTION,
    inputSchema: askForAppPathParamsSchema,
    outputSchema: askForAppPathOutputSchema,
  });
