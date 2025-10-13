import { codingAgentTools } from '@stagewise/agent-tools';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import { getProjectInfo } from '@stagewise/agent-prompt-snippets';
import { LevelDb } from '../utils/typed-db.js';
import { z } from 'zod';
import { stepCountIs, tool } from 'ai';
import { streamText, type ModelMessage } from 'ai';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';

async function getSystemPrompt(clientRuntime: ClientRuntime) {
  const projectInfo = await getProjectInfo(clientRuntime);
  return `
You are a code analysis agent specialized in discovering and mapping UI-specific browser routes to their corresponding source code files in web projects.

Your working environment is a user's web project and you are given tools to search the codebase and save the route mapping information.

Your task is to:
1. Scan the repository to identify the application mentioned by the user.
2. Discover all UI-specific routes + layout files and their corresponding source files, depending on the framework (e.g. pages/, index.svelte, app/layout.tsx, etc.)
3. Save comprehensive route mapping information by using the saveRouteMappingTool

Framework Detection:
- Check package.json for framework dependencies (next, nuxt, react-router, vue-router, @angular/router, sveltekit, remix, etc.)
- Look for framework-specific directory structures (pages/, app/, routes/, src/routes/)

Syntax for route paths:
- Normal routes: /route/path/...
- Dynamic routes: /:param/...

IMPORTANT:
- Only include routes that are used in the application mentioned by the user.
- Actively search for UI routes, not API routes.
- Create a complete mapping of browser-accessible routes to source files as relative paths
- Preserve the exact file paths for source files as relative paths
- Stop when you discovered and saved all routes for the application mentioned by the user.

Here is initial information about the structure of the project you are working on:
${projectInfo.content}
`;
}

const routeSchema = z.object({
  browserRoute: z
    .string()
    .describe(
      'The browser-accessible route path, e.g. "/", "/docs", "/docs/:slug"',
    ),
  sourceFile: z
    .string()
    .describe(
      'The relative path to the source file implementing this route, e.g. "apps/website/src/app/(home)/page.tsx", "apps/website/src/app/docs/[[...slug]]/page.tsx"',
    ),
  layoutFiles: z
    .array(z.string())
    .optional()
    .describe(
      'The relative paths to all layout files that apply to this route, e.g. ["apps/website/src/app/layout.tsx", "apps/website/src/app/docs/layout.tsx"]',
    ),
  isDynamic: z
    .boolean()
    .describe('Whether the route contains dynamic segments like :id or [slug]'),
  baseDirectory: z
    .string()
    .optional()
    .describe(
      'The top most base directory of this route, e.g. "apps/website/src/app"',
    ),
});

const routeMappingSchema = z.object({
  app: z
    .string()
    .describe(
      'The name of the application, e.g. "website", "docs" or "app" when multiple applications are present in a monorepo. If there is only one application, this must be "app".',
    ),
  routes: z.array(routeSchema),
  createdAt: z
    .number()
    .describe('Timestamp when this route mapping was created'),
});

const routeMappingToolSchema = routeSchema.extend({
  app: z
    .string()
    .describe(
      'The name of the application, e.g. "website", "docs" or "app" when multiple applications are present in a monorepo. If there is only one application, this must be "app".',
    ),
});

export type RouteMapping = z.infer<typeof routeMappingSchema>;

export async function searchAndSaveRouteInformationFromProject(
  model: LanguageModelV2,
  clientRuntime: ClientRuntime,
  workspaceDataPath: string,
  appName = 'website',
): Promise<{ success: boolean; message: string }> {
  const system = await getSystemPrompt(clientRuntime);
  const routeEntry: RouteMapping = {
    app: appName,
    routes: [],
    createdAt: Date.now(),
  };

  const saveRouteMappingTool = tool({
    description: 'Save a route mapping entry.',
    inputSchema: routeMappingToolSchema,
    execute: async (args) => {
      routeEntry.routes.push(args);
      return {
        success: true,
        message: `Route mapping saved: ${args.browserRoute} -> ${args.sourceFile}`,
      };
    },
  });

  try {
    const prompt = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Please search for the routes in the application and save the information using saveRouteMappingTool. The name of the app is ${appName}.`,
        },
      ],
    } satisfies ModelMessage;

    const codingTools = codingAgentTools(clientRuntime);

    const stream = streamText({
      model,
      messages: [{ role: 'system', content: system }, prompt],
      tools: {
        saveRouteMapping: saveRouteMappingTool,
        grepSearchTool: codingTools.grepSearchTool,
        listFilesTool: codingTools.listFilesTool,
        globTool: codingTools.globTool,
        readFileTool: codingTools.readFileTool,
      },
      stopWhen: stepCountIs(100), // Allow more steps for comprehensive route discovery
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

    const db = LevelDb.getInstance(workspaceDataPath);
    await db.open();
    await db.routing.put(`${routeEntry.app}`, routeEntry);
    await db.close();

    return {
      success: true,
      message: `Route mapping complete.`,
    };
  } catch (_error) {
    return {
      success: false,
      message:
        'Failed to search and save route information: ' +
        (_error instanceof Error ? _error.message : 'Unknown error'),
    };
  }
}
