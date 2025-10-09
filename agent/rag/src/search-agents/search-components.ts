import { cliTools } from '@stagewise/agent-tools';
import { getProjectInfo } from '@stagewise/agent-prompt-snippets';
import { LevelDb } from '../utils/typed-db.js';
import { z } from 'zod';
import { stepCountIs, tool } from 'ai';
import { streamText, type ModelMessage } from 'ai';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import type { LanguageModelV2 } from '@ai-sdk/provider';

async function getSystemPrompt(clientRuntime: ClientRuntime) {
  const projectInfo = await getProjectInfo(clientRuntime);

  return `You are a code analysis agent specialized in discovering and cataloging UI component libraries within web projects.

Your task is to:
1. Search through the entire project codebase to identify component libraries and UI components for the application mentioned by the user.
2. Identify the file paths where components are defined
3. Understand the structure and organization of the component libraries
4. Save detailed information about each discovered component library

When searching:
- Look for common component directory patterns in the codebase
- Check package.json for UI library dependencies and check the dependencies for component libraries
- Identify design system implementations and component collections
- Find both styled components and headless/unstyled components
- Detect utility components, layout components, and feature-specific components

Be thorough but efficient - focus on finding actual UI components that developers use to build interfaces.

IMPORTANT: Make sure that the component paths do not intersect with each other and components are not mentioned in more than one component library.
IMPORTANT: Only include components that are used in the application mentioned by the user.

Here is initial information about the project you are working on:
${projectInfo.content}
`;
}

const librarySchema = z.object({
  libraryPath: z
    .string()
    .describe(
      'The relative path of the component library to save, e.g. "packages/ui/src/components"',
    ),
  availableComponentPaths: z
    .array(z.string())
    .describe(
      'Full relative paths of available components in the component library, e.g. ["packages/ui/src/components/button.tsx", "packages/ui/src/components/input.tsx", "packages/ui/src/components/select.tsx"]',
    ),
  description: z
    .string()
    .describe(
      'The description of the component library, e.g. "A library of components that are only used in the web application. It uses Tailwind CSS for styling and shadcn/ui for the components."',
    ),
});

const componentLibraryInformationSchema = z.object({
  app: z
    .string()
    .describe(
      'The name of the application, e.g. "website", "docs" or "app" when multiple applications are present in a monorepo. If there is only one application or the components are global, this should be "app".',
    ),
  libraries: z.array(librarySchema),
  createdAt: z
    .number()
    .describe('Timestamp when this component library information was created'),
});

const componentLibraryInformationToolSchema = librarySchema.extend({
  app: z
    .string()
    .describe(
      'The name of the application, e.g. "website", "docs" or "app" when multiple applications are present in a monorepo. If there is only one application or the components are global, this should be "app".',
    ),
});

export type ComponentLibraryInformation = z.infer<
  typeof componentLibraryInformationSchema
>;

export async function searchAndSaveComponentInformationFromSelectedElements(
  model: LanguageModelV2,
  clientRuntime: ClientRuntime,
  workspaceDataPath: string,
  appName = 'website',
): Promise<{ success: boolean; message: string }> {
  const system = await getSystemPrompt(clientRuntime);

  const componentLibraryEntry: ComponentLibraryInformation = {
    app: appName,
    libraries: [],
    createdAt: Date.now(),
  };

  const saveComponentInformationTool = tool({
    description: 'Save the component library information to the database.',
    inputSchema: componentLibraryInformationToolSchema,
    execute: async (args) => {
      componentLibraryEntry.libraries.push(args);
      return { success: true, message: 'Component information saved' };
    },
  });

  try {
    const prompt = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Search for component libraries and their available components in the codebase and save the information to the database using the saveComponentInformationTool. \n\nThe name of the app is ${appName}.`,
        },
      ],
    } satisfies ModelMessage;

    const allTools = cliTools(clientRuntime);

    const stream = streamText({
      model,
      messages: [{ role: 'system', content: system }, prompt],
      tools: {
        saveComponentInformation: saveComponentInformationTool,
        grepSearchTool: allTools.grepSearchTool,
        listFilesTool: allTools.listFilesTool,
        globTool: allTools.globTool,
        readFileTool: allTools.readFileTool,
      },
      stopWhen: stepCountIs(30),
      temperature: 0.15,
      providerOptions: {
        openai: {
          parallelToolCalls: false,
        },
      },
      onError: async (_) => {},
    });

    for await (const _ of stream.fullStream) {
      // consume the stream
    }

    const db = LevelDb.getInstance(workspaceDataPath);
    await db.open();
    await db.component.put(
      `${componentLibraryEntry.app}`,
      componentLibraryEntry,
    );
    await db.close();

    return {
      success: true,
      message: `Component information saved. Found ${componentLibraryEntry.libraries.length} component libraries.`,
    };
  } catch (_error) {
    return {
      success: false,
      message:
        'Failed to search and save component information: ' +
        (_error instanceof Error ? _error.message : 'Unknown error'),
    };
  }
}
