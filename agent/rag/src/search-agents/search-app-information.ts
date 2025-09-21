import { cliTools } from '@stagewise/agent-tools';
import { getProjectInfo } from '@stagewise/agent-prompt-snippets';
import { LevelDb } from '../utils/typed-db.js';
import { z } from 'zod';
import { stepCountIs, tool } from 'ai';
import { streamText, type ModelMessage } from 'ai';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { createAnthropic } from '@ai-sdk/anthropic';

async function getSystemPrompt(clientRuntime: ClientRuntime) {
  const projectInfo = await getProjectInfo(clientRuntime);
  return `You are a code analysis agent specialized in discovering applications in a repository (including monorepos) and summarizing their use-cases. Your working environment is a user's web project and you are given tools to search the codebase and save the app information.

Your task is to:
1. Scan the repository to identify the application mentioned by the user.
2. Capture the following and save it using saveAppInformationTool:
   - app: the app name you can extract from the workspace configuration (e.g. "website" for "apps/website"). Use 'app' if there is only one application or the app is global.
   - path: the application's root directory as a relative path (e.g., "apps/website")
   - description: A summary of the application, containing:
    - The business logic/ purpose of the application (e.g. This application is a customer management system that allows users to manage their customers, schedule appointments, and manage their invoices)
    - The technologies and frameworks used in the application (e.g. Typescript, React, Next.js, Tailwind CSS, etc.)

When discovering the app:
- Inspect package.json workspaces and the app's package.json to detect frameworks and entry points
- Look for framework-specific directory structures (Next.js: app/ or pages/; Nuxt: pages/; React Router: src/routes; Angular: angular.json; SvelteKit: src/routes; Remix: app/routes; CLI apps: bin/ or executable entry points)
- Consider monorepo layouts (apps/*, packages/* that are apps, examples/*)

IMPORTANT:
- Use exact relative paths as found on disk
- Be thorough but efficient
- Stop when you have found the app and saved the information

Here is initial information about the structure of the project you are working on:
${projectInfo.content}
`;
}

const appInformationSchema = z.object({
  app: z
    .string()
    .describe(
      'The name of the application, e.g. "website", "docs" or "app" when multiple applications are present in a monorepo. If there is only one application or the styles are global, this should be "app".',
    ),
  path: z
    .string()
    .describe('The relative path of the app, e.g. "apps/website"'),
  description: z
    .string()
    .describe(
      "General description of the app, it's purpose and how it is used. Also include basic information about the technologies used in the app, e.g. React, Next.js, Tailwind CSS, etc.",
    ),
  createdAt: z
    .number()
    .describe('Timestamp when this app information was created'),
});

const appInformationToolSchema = appInformationSchema.omit({ createdAt: true });

export type AppInformation = z.infer<typeof appInformationSchema>;

export async function searchAndSaveAppInformationFromProject(
  apiKey: string,
  clientRuntime: ClientRuntime,
  appName = 'website',
): Promise<{ success: boolean; message: string }> {
  const baseUrl = process.env.LLM_PROXY_URL || 'http://localhost:3002';
  const system = await getSystemPrompt(clientRuntime);

  const saveAppInformationTool = tool({
    description: 'Save the app information to the database.',
    inputSchema: appInformationToolSchema,
    execute: async (args) => {
      const db = LevelDb.getInstance(clientRuntime);
      await db.open();
      await db.app.put(`${args.app}:${args.path}`, {
        ...args,
        createdAt: Date.now(),
      });
      await db.close();
      return { success: true, message: 'App information saved' };
    },
  });

  try {
    const litellm = createAnthropic({
      apiKey: apiKey,
      baseURL: `${baseUrl}/v1`,
    });

    const prompt = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Please search for the application and save the information using saveAppInformationTool. The name of the app is ${appName}.`,
        },
      ],
    } satisfies ModelMessage;

    const allTools = cliTools(clientRuntime);

    const stream = streamText({
      model: litellm('gpt-5-mini'),
      messages: [{ role: 'system', content: system }, prompt],
      tools: {
        saveAppInformation: saveAppInformationTool,
        grepSearchTool: allTools.grepSearchTool,
        listFilesTool: allTools.listFilesTool,
        globTool: allTools.globTool,
        readFileTool: allTools.readFileTool,
      },
      stopWhen: stepCountIs(100), // Increased to allow more thorough color extraction
      temperature: 0.15,
      providerOptions: {
        openai: {
          parallelToolCalls: false,
        },
      },
      onError: (_) => {
        // log error here
      },
    });

    for await (const _ of stream.fullStream) {
      // consume the stream
    }

    return {
      success: true,
      message: `App information saved.`,
    };
  } catch (_error) {
    return {
      success: false,
      message:
        'Failed to search and save app information: ' +
        (_error instanceof Error ? _error.message : 'Unknown error'),
    };
  }
}
