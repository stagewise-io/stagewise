import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION = `Ask the [USER] to confirm the scope of file access for the agent. Determines what portion of the codebase the agent can read/write. When using this tool, ask the [USER] a question (e.g. "Do you want to give stagewise access to the whole project?").

Parameters:
- suggestedPath (string, REQUIRED): Relative path from selected app to desired access root. Always pick the project root path. Examples: "." restricts to app directory only, "../.." navigates up two levels, "{GIT_REPO_ROOT}" gives access to entire parent git repository (recommended default). Must be valid relative path or special token.
- selectedAppPath (string, REQUIRED): Absolute path of app previously selected via askForAppPathTool (e.g., "/Users/user/project/apps/website"). Used as reference point for relative path calculation.

Behavior: User provides or confirms the path.`;

export const askForAgentAccessPathParamsSchema = z.object({
  userInput: z.object({
    suggestedPath: z
      .string()
      .describe(
        'Relative path from selected app to desired access root. Always pick the project root path. Examples: "." restricts to app directory only, "../.." navigates up two levels, "{GIT_REPO_ROOT}" gives access to entire parent git repository (recommended default). Must be valid relative path or special token.',
      ),
  }),
  selectedAppPath: z
    .string()
    .describe(
      'Absolute path of app previously selected via askForAppPathTool (e.g., "/Users/user/project/apps/website"). Used as reference point for relative path calculation.',
    ),
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
