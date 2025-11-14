import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { tool } from 'ai';
import { z } from 'zod';

export const DESCRIPTION = `Ask the [USER] if they want stagewise to auto-start with their dev script. Shows before/after preview of package.json modification. When using this tool, ask the [USER] a question (e.g. "Do you want to integrate stagewise into the dev script of your app, so that stagewise starts automatically?").

Parameters:
- diff (object, REQUIRED): Preview of dev script changes containing:
  - before (string, REQUIRED): Current dev script command from package.json (e.g., "next dev", "vite", "npm run dev").
  - after (string, REQUIRED): Proposed wrapped command using correct package manager syntax. Examples by package manager:
    - npm: "npx stagewise@beta -- next dev"
    - pnpm: "pnpm dlx stagewise@beta -- next dev"
    - yarn: "yarn dlx stagewise@beta -- next dev"
    - bun: "bunx stagewise@beta -- next dev"
  Note: Always use @beta version tag, not @latest.

Behavior: User confirms or rejects integration. If confirmed, agent modifies package.json. If rejected, agent doesn't modify package.json and MUST go on with the setup process.`;

export const askForDevScriptIntegrationParamsSchema = z.object({
  userInput: z.object({
    diff: z.object({
      before: z
        .string()
        .describe(
          'Current dev script command from package.json (e.g., "next dev", "vite", "npm run dev").',
        ),
      after: z
        .string()
        .describe(
          'Proposed wrapped command using correct package manager syntax. Examples: npm="npx stagewise@beta -- next dev", pnpm="pnpm dlx stagewise@beta -- next dev", yarn="yarn dlx stagewise@beta -- next dev", bun="bunx stagewise@beta -- next dev". Always use @beta version tag.',
        ),
    }),
  }),
});

export const askForDevScriptIntegrationOutputSchema = z.object({
  shouldIntegrate: z
    .boolean()
    .describe(
      'Whether the USER wants to integrate stagewise into the dev script of their app.',
    ),
});

export type AskForDevScriptIntegrationOutput = z.infer<
  typeof askForDevScriptIntegrationOutputSchema
>;

export type AskForDevScriptIntegrationParams = z.infer<
  typeof askForDevScriptIntegrationParamsSchema
>;

export const askForDevScriptIntegrationTool = (_clientRuntime: ClientRuntime) =>
  tool({
    name: 'askForDevScriptIntegrationTool',
    description: DESCRIPTION,
    inputSchema: askForDevScriptIntegrationParamsSchema,
    outputSchema: askForDevScriptIntegrationOutputSchema,
  });
