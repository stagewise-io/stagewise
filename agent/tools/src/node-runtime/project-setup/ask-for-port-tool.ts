import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION = `Ask [USER] for the local development port their app runs on. Required for stagewise to connect to dev preview. When using this tool, ask [USER] "What port is your app running on?" and explaint why you suggested the given port (if you suggested one).

Parameters:
- suggestedAppPort (number, OPTIONAL): Inferred port number if detectable from project config or framework defaults (e.g. Next.js=3000, Vite=5173, ...). Omit if port cannot be determined.

Visual behavior of the tool: The tool displays a number input field pre-filled with the suggested port (or 3000 if no suggestion provided). Two buttons are provided: "Cancel" (secondary) and "Submit" (primary). 

Outcome of the tool: The tool returns the port number (as number type) that [USER] entered or confirmed, or indicates [USER] cancelled the tool.`;

export const askForPortParamsSchema = z.object({
  userInput: z.object({
    suggestedAppPort: z
      .number()
      .describe(
        'Inferred port number if detectable from project config. Omit if port cannot be determined.',
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
