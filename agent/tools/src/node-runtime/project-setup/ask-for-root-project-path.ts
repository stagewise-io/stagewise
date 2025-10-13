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

/**
 * Ask for root project path tool
 * Ask the user to confirm the root project path
 * Returns the root project path that the user confirmed
 */
export async function askForRootProjectPathToolExecute(
  params: AskForRootProjectPathParams,
  _clientRuntime: ClientRuntime,
) {
  const { userInput } = params;
  const dummyPath = userInput.suggestedPath;
  return {
    success: true,
    message: `USER confirmed path: ${dummyPath}`,
    result: { path: dummyPath },
  };
}

export const askForRootProjectPathTool = (_clientRuntime: ClientRuntime) =>
  tool({
    name: 'askForRootProjectPathTool',
    description: DESCRIPTION,
    inputSchema: askForRootProjectPathParamsSchema,
    outputSchema: askForRootProjectPathOutputSchema,
  });
