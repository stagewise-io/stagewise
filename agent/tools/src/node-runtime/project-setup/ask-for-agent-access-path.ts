import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION = `Ask the [USER] to confirm the scope of file access for the agent. Determines what part of the codebase the agent can read/write.

PRE-CALL BEHAVIOR: Before calling this tool, analyze the workspace structure to determine the best access path. Do NOT ask the user which path they prefer—this tool presents YOUR suggestion for the user to confirm or reject. Default to "{GIT_REPO_ROOT}" for most projects.

IMPORTANT: When calling this tool, ask the [USER] a simple YES/NO question (e.g. "Is this the path stagewise should have access to?", "Do you want to give stagewise access to this path?"). The [USER] can only confirm or reject the single path you suggest—they cannot edit it or choose between options. NEVER ask an either-or question before or with this tool call.

Parameters:
- suggestedPath (string, REQUIRED): The access path YOU determined based on workspace analysis. Use "{GIT_REPO_ROOT}" to give access to the entire git repository (recommended default for most projects).
- selectedAppPath (string, REQUIRED): Absolute path of app previously selected via askForAppPathTool (e.g., "/Users/user/project/apps/website"). Used as reference point for relative path calculation.

Visual behavior: The tool presents the user with the suggested path as immutable text. It displays two buttons: "Cancel" (secondary) and "Confirm Access" (primary). The user cannot modify the path.

Outcome: The tool returns the path that the user confirmed or a message that the user cancelled the tool.`;

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
