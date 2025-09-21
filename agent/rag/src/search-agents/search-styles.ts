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
  return `You are a code analysis agent specialized in discovering and cataloging style configurations, global styles, and color systems within web projects.

Your working environment is a user's web project and you are given tools to search the codebase and save the style information.

Your task is to:
1. Search through the entire project codebase to identify any style configurations and global style files for the application mentioned by the user.
2. Identify the relative file paths where styles and colors are defined
3. Save detailed information about styles using the saveStyleInformationTool

When saving the style information:
3.1 Briefly describe what the style file contains in the fileDescription
3.2 Describe the style of the project that is used in this style file in the styleDescription
3.3 Whether to always include the content of this style file in the context (includeContentInContext)
   - "always": Files that are always relevant for frontend tasks. For example: global.css, tailwind.config.js, colors.css, etc.
   - "decide": Files that are only relevant for frontend tasks if the context agent finds it relevant. For example: theme.ts, etc.

IMPORTANT: Stop when you have found and saved all styles for the application mentioned by the user.

When searching for styles:
- Look for style configuration files (tailwind.config.*, postcss.config.*, vite.config.*, ...)
- Find global style files (global.css, app.css, index.css, styles.css, main.css, ...)
- Search for CSS-in-JS theme configurations (theme.ts, theme.js, styled-components themes, ...)
- Only include styles that are used in the application mentioned by the user.


Be thorough in style extraction - we want a complete picture of the project's style system that developers can reference easily.

IMPORTANT:
Include theme and style information in the styleDescription so that one can easily identify the visual style of the application by reading the styleDescription. Include ACTUAL colors.
E.g. "Modern, clean design that implements a glassy look. \nColors: Primary: #333333, Secondary: #FFFFFF, Accent: #000000, Background: #FFFFFF, Text: #000000. \nFont: The main font is Inter which is used for all text. \nShadows: Heavy shadows are used for depth. \nBorder radii: Mostly 8px."

Here is initial information about the project you are working on:
${projectInfo.content}
`;
}

const styleInformationSchema = z.object({
  app: z
    .string()
    .describe(
      'The name of the application, e.g. "website", "docs" or "app" when multiple applications are present in a monorepo. If there is only one application or the styles are global, this must be "app".',
    ),
  files: z
    .array(
      z.object({
        filePath: z
          .string()
          .describe(
            'The relative path of the style file, e.g. "src/styles/global.css"',
          ),
        fileDescription: z
          .string()
          .describe(
            'Description of what this style file contains, e.g. "Global CSS with custom properties for the color system and spacing tokens"',
          ),
      }),
    )
    .describe(
      'The relative paths of the style files for ths application, e.g. ["src/styles/global.css", "src/styles/theme.css"]',
    ),
  styleDescription: z
    .string()
    .describe(
      'Description of the style and color theme of the style that is used in this application, e.g. "Modern, clean design that implements a glassy look with #333333 as the main color and #FFFFFF as the background color. The main font is Inter which is used for all text. Heavy shadows are used for depth and border radii are mostly 8px."',
    ),
  createdAt: z
    .number()
    .describe('Timestamp when this style information was created'),
});

const styleInformationToolSchema = styleInformationSchema.omit({
  createdAt: true,
});

export type StyleInformation = z.infer<typeof styleInformationSchema>;

export async function searchAndSaveStyleInformationFromProject(
  apiKey: string,
  clientRuntime: ClientRuntime,
  appName = 'website',
): Promise<{ success: boolean; message: string }> {
  const baseUrl = process.env.LLM_PROXY_URL || 'http://localhost:3002';
  const system = await getSystemPrompt(clientRuntime);

  const saveStyleInformationTool = tool({
    description:
      'Save the style file information to the database. You can use this tool multiple times to save information about multiple style resources.',
    inputSchema: styleInformationToolSchema,
    execute: async (args) => {
      const db = LevelDb.getInstance(clientRuntime);
      await db.open();
      await db.style.put(`${args.app}`, { ...args, createdAt: Date.now() });
      await db.close();
      return { success: true, message: 'Style information saved' };
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
          text: `Please search for the styles in the application and save the information using saveStyleInformationTool. The name of the app is ${appName}.`,
        },
      ],
    } satisfies ModelMessage;

    const allTools = cliTools(clientRuntime);

    const stream = streamText({
      model: litellm('gpt-5-mini'),
      messages: [{ role: 'system', content: system }, prompt],
      tools: {
        saveStyleInformation: saveStyleInformationTool,
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
      message: `Style information saved.`,
    };
  } catch (_error) {
    return {
      success: false,
      message:
        'Failed to search and save style information: ' +
        (_error instanceof Error ? _error.message : 'Unknown error'),
    };
  }
}
