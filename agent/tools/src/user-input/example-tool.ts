/**
 * Example User-Input Tool Template
 *
 * This file serves as a template for implementing user-input tools.
 * User-input tools are special tools that require interaction with the user
 * through the UI before returning a result.
 *
 * To create a new user-input tool:
 * 1. Copy this file and rename it to match your tool's purpose
 * 2. Replace all "exampleUserInput" prefixes with your tool name
 * 3. Update DESCRIPTION with detailed tool documentation
 * 4. Define your input parameters in the params schema
 * 5. Define the expected output in the output schema
 * 6. Implement the corresponding UI component to handle user interaction
 */

import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

/**
 * Tool description shown to the AI agent.
 *
 * Best practices for DESCRIPTION:
 * - Explain what the tool does and when to use it
 * - Document all parameters with types and examples
 * - Describe the visual behavior (what the user sees)
 * - Explain the outcome (what the tool returns)
 */
export const DESCRIPTION = `Ask the [USER] for input via a UI component.
IMPORTANT: When using this tool, ask the [USER] a question before calling it.

Parameters:
- exampleParam (string, REQUIRED): Description of the parameter with example values.

Visual behavior: Describe what UI component is shown and how the user interacts with it.

Outcome: Describe what the tool returns based on user interaction.`;

/**
 * Input schema for the tool.
 *
 * User-input tools wrap parameters in a `userInput` object to signal
 * that these parameters configure the UI shown to the user.
 */
export const exampleUserInputParamsSchema = z.object({
  userInput: z.object({
    exampleParam: z
      .string()
      .describe('Description of this parameter for the AI agent.'),
    // Add more parameters as needed:
    // optionalParam: z.string().optional().describe('Optional parameter'),
    // arrayParam: z.array(z.string()).describe('Array of strings'),
  }),
});

/**
 * Output schema for the tool.
 *
 * Defines the structure of data returned after user interaction.
 * Should include fields for both successful completion and cancellation.
 */
export const exampleUserInputOutputSchema = z.object({
  result: z.string().describe('The result from user interaction'),
  // Add more output fields as needed:
  // cancelled: z.boolean().optional().describe('Whether the user cancelled'),
});

/** TypeScript type inferred from the output schema */
export type ExampleUserInputOutput = z.infer<
  typeof exampleUserInputOutputSchema
>;

/** TypeScript type inferred from the params schema */
export type ExampleUserInputParams = z.infer<
  typeof exampleUserInputParamsSchema
>;

/**
 * Tool factory function.
 *
 * @param _clientRuntime - The client runtime instance (unused in definition,
 *                         but available if needed for tool configuration)
 * @returns The tool definition for the AI SDK
 */
export const exampleUserInputTool = (_clientRuntime: ClientRuntime) =>
  tool({
    description: DESCRIPTION,
    inputSchema: exampleUserInputParamsSchema,
    outputSchema: exampleUserInputOutputSchema,
  });
