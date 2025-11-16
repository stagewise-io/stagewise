import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION = `Ask the [USER] to pick their preferred IDE for opening files. 
IMPORTANT: When using this tool, ask the [USER] a question (e.g. "Which IDE would you like to use for opening files?").

This tool presents the available IDE options (VS Code, Cursor, Windsurf, Trae, Other) and allows the user to select one.
The tool requires NO parameters - it always presents the same IDE options available in the application.

Visual behavior of the tool: The tool presents IDE options as clickable cards with logos. Two action buttons are provided: "Skip Selection" (secondary) and "Confirm" (primary, disabled until an IDE is selected).

Outcome of the tool: The tool returns the selected IDE value that the user picked, or indicates the user skipped/cancelled the selection.`;

export const askForIdeParamsSchema = z.object({
  userInput: z.object({
    // No dynamic parameters needed - the tool always presents the fixed IDE options
  }),
});

export const askForIdeOutputSchema = z.object({
  ide: z
    .enum(['vscode', 'cursor', 'zed', 'kiro', 'windsurf', 'trae', 'other'])
    .describe('The IDE that the USER picked'),
});

export type AskForIdeOutput = z.infer<typeof askForIdeOutputSchema>;

export type AskForIdeParams = z.infer<typeof askForIdeParamsSchema>;

export const askForIdeTool = (_clientRuntime: ClientRuntime) =>
  tool({
    name: 'askForIdeTool',
    description: DESCRIPTION,
    inputSchema: askForIdeParamsSchema,
    outputSchema: askForIdeOutputSchema,
  });
