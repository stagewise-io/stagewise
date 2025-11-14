import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION = `Ask the [USER] to pick the app path from the open project by providing a list of all apps and their paths in the project. When using this tool, ask the [USER] a question (e.g. "Which app do you want to use stagewise for?").

Parameters:
- suggestedPaths (array, REQUIRED): List of all apps and their paths in the project. Each entry contains:
  - absolutePath (string, REQUIRED): Absolute filesystem path to app directory (e.g., "/Users/user/project/apps/website").
  - displayName (string, REQUIRED): Short user-friendly name for the app (e.g., "apps/website", "apps/docs", "workspace-path").
  Minimum 1 entry required. For non-monorepos: single entry with the name of the app and workspace-path (the root of the project) as path. For monorepos: multiple entries for each frontend package/ app.

Behavior: User provides or confirms the path.`;

export const askForAppPathParamsSchema = z.object({
  userInput: z.object({
    suggestedPaths: z
      .array(
        z.object({
          absolutePath: z
            .string()
            .describe(
              'Absolute filesystem path to app directory (e.g., "/Users/user/project/apps/website").',
            ),
          displayName: z
            .string()
            .describe(
              'Short user-friendly name for the app (e.g., "apps/website", "apps/docs", "workspace-path").',
            ),
        }),
      )
      .describe(
        'List of all apps and their paths in the project. Minimum 1 entry required. For non-monorepos: single entry with displayName "workspace-path". For monorepos: multiple entries for each frontend package.',
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
