import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION =
  'Ask the user to pick the app path from the open project. Will be open_path if the project is not a monorepo, otherwise it will be the paths of the apps in the monorepo';

export const askForAppPathParamsSchema = z.object({
  userInput: z.object({
    suggestedPaths: z
      .array(z.string())
      .describe(
        'The app paths the USER can pick from - will be open_path if the project is not a monorepo',
      )
      .min(1),
  }),
});

export const askForAppPathOutputSchema = z.object({
  path: z.string().describe('The app path that the USER picked'),
});

export type AskForAppPathOutput = z.infer<typeof askForAppPathOutputSchema>;

export type AskForAppPathParams = z.infer<typeof askForAppPathParamsSchema>;

/**
 * Ask for app path tool
 * Let the user pick the app path from the open project
 * Returns the app path that the user picked
 */
export async function askForAppPathToolExecute(
  params: AskForAppPathParams,
  _clientRuntime: ClientRuntime,
) {
  const { userInput } = params;
  const dummyPath = userInput.suggestedPaths[0];
  return {
    success: true,
    message: `USER picked path: ${dummyPath}`,
    result: { path: dummyPath },
  };
}

export const askForAppPathTool = (_clientRuntime: ClientRuntime) =>
  tool({
    name: 'askForAppPathTool',
    description: DESCRIPTION,
    inputSchema: askForAppPathParamsSchema,
    outputSchema: askForAppPathOutputSchema,
  });
