import { z } from 'zod';
import type {
  SelectedElement,
  UserMessageMetadata,
} from '@stagewise/karton-contract';
import { generateText, type ModelMessage, generateObject } from 'ai';
import { LevelDb } from '@stagewise/agent-rag';
import { queryRagWithoutRerank } from '@stagewise/agent-rag';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { createAnthropic } from '@ai-sdk/anthropic';
import type {
  ComponentLibraryInformation,
  StyleInformation,
} from '@stagewise/agent-rag';

type ContextFile = {
  relativePath: string;
  content: string;
  startLine: number;
  endLine: number;
};

type RetrievalResult = Omit<ContextFile, 'content'>;

async function _getComponentInformation(workspaceDataPath: string) {
  const db = LevelDb.getInstance(workspaceDataPath);
  await db.open();
  const componentInformation: ComponentLibraryInformation[] = [];
  for await (const [_key, value] of db.component.iterator()) {
    componentInformation.push(value);
  }
  await db.close();
  return JSON.stringify(componentInformation, null, 2);
}

async function _getStyleInformation(workspaceDataPath: string) {
  const db = LevelDb.getInstance(workspaceDataPath);
  await db.open();
  const styleInformation: StyleInformation[] = [];
  for await (const [_key, value] of db.style.iterator()) {
    styleInformation.push(value);
  }
  await db.close();
  return JSON.stringify(styleInformation, null, 2);
}

/**
 * Checks if a stored mapped route represents the current route
 * @param browserRoute - The relative browser route to check (e.g. "/docs/my-page" or "/settings")
 * @param storedMappedRoute - The stored mapped route to compare with (e.g. "/docs/:slug" or "/settings")
 * @returns True if the browser route is the current route, false otherwise
 */
function isCurrentRoute(browserRoute: string, storedMappedRoute: string) {
  const browserRouteParts = browserRoute.split('/');
  const storedMappedRouteParts = storedMappedRoute.split('/');
  if (browserRouteParts.length !== storedMappedRouteParts.length) return false;

  for (let i = 0; i < browserRouteParts.length; i++) {
    if (
      browserRouteParts[i] !== storedMappedRouteParts[i] &&
      !storedMappedRouteParts[i]?.startsWith(':')
    )
      return false;
  }
  return true;
}

async function _getRouteFileSnippets(
  userInput: UserMessageMetadata,
  workspaceDataPath: string,
  clientRuntime: ClientRuntime,
) {
  try {
    const db = LevelDb.getInstance(workspaceDataPath);
    await db.open();
    const currentUrl = userInput.browserData?.currentUrl;
    const relativePath = currentUrl ? new URL(currentUrl).pathname : null;
    if (!relativePath) return [];
    const filePaths = [];
    for await (const [_key, value] of db.routing.iterator()) {
      for (const route of value.routes) {
        const storedMappedRoute = route.browserRoute;
        const isValid = isCurrentRoute(relativePath, storedMappedRoute);
        if (!isValid) continue;
        filePaths.push(route.sourceFile);
        for (const layoutFile of route.layoutFiles ?? [])
          filePaths.push(layoutFile);
      }
    }
    await db.close();
    const fileSnippets: ContextFile[] = [];
    for (const filePath of filePaths) {
      const file = await clientRuntime.fileSystem.readFile(filePath);
      if (!file.success) continue;
      fileSnippets.push({
        relativePath: filePath,
        content: file.content || '',
        startLine: 0,
        endLine: file.totalLines || 0,
      });
    }
    // TODO: do a gemini-flash retrieval again and pick the right file snippet
    return fileSnippets;
  } catch {
    return { error: 'Could not retrieve a file for the current route.' };
  }
}

async function queryRagForSelectedElement(
  element: SelectedElement,
  workspaceDataPath: string,
  apiKey: string,
) {
  const litellm = createAnthropic({
    apiKey: apiKey,
    baseURL: `${process.env.LLM_PROXY_URL}/v1`,
  });

  const descriptionPrompt = `You are a helpful assistant that describes the semantic of elements in a web application by looking at the DOM structure and selected elements.\n\nExample:\n\n- user:\n\tThis is the selected element:\n\t\t- <input type="text" id="search-input" placeholder="Search..." classNames="w-full text-blue-500 bg-white">\n\t\t- <button id="search-button" classNames="bg-red-500 text-white">Search</button>\n\n- assistant:\n\tA white search input with blue text with a search button with a red background and white text that triggers a search action.`;

  const prompt = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `This is the selected element: \n\n${JSON.stringify(element)}`,
      },
    ],
  } satisfies ModelMessage;

  const elementDescription = await generateText({
    model: litellm('gemini-2.5-flash-lite'),
    messages: [{ role: 'system', content: descriptionPrompt }, prompt],
    temperature: 0.1,
  });

  const retrievedFiles = await queryRagWithoutRerank(
    elementDescription.text,
    workspaceDataPath,
    apiKey,
    10,
  );

  return retrievedFiles;
}

export async function retrieveFileForSelectedElement(
  element: SelectedElement,
  workspaceDataPath: string,
  apiKey: string,
): Promise<RetrievalResult | { error: string }> {
  try {
    const retrievedFiles = await queryRagForSelectedElement(
      element,
      workspaceDataPath,
      apiKey,
    );
    const fileParts: ContextFile[] = [];

    for (const file of retrievedFiles) {
      fileParts.push(file);
    }

    const correctFileSnippet = await pickCorrectFileSnippetFromSnippets(
      element,
      fileParts,
      apiKey,
    );

    return correctFileSnippet;
  } catch (_error) {
    return { error: 'Failed to retrieve file for selected element' };
  }
}

async function pickCorrectFileSnippetFromSnippets(
  element: SelectedElement,
  snippets: ContextFile[],
  apiKey: string,
) {
  const snippetsWithLineNumbers = snippets.map((s) => {
    const lines = s.content.split('\n');
    let codeStartIndex = -1;

    // Find the line with "Code:" followed by "---"
    // TODO: Improve this to be more robust
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i]?.includes('Code:') && lines[i + 1]?.trim() === '---') {
        codeStartIndex = i + 2; // Start after the "---" line
        break;
      }
    }

    const numberedLines = lines.map((line, index) => {
      if (codeStartIndex >= 0 && index >= codeStartIndex) {
        const lineNumber = s.startLine + (index - codeStartIndex);
        return `${lineNumber}: ${line}`;
      }
      return `${index + 1}: ${line}`;
    });

    return {
      ...s,
      content: numberedLines.join('\n'),
    };
  });

  const fileSelectionPrompt = `You are a helpful assistant that receives an excerpt of HTML ELements from a Browser DOM, as well as various file snippets that are potential candidates to be the source code of these HTML elements.\nYOUR_TASK: Pick the right file snippet that is most likely to be the source code of the included HTML Elements.\nOUTPUT_REQUIREMENTS: Output the following content to describe the picked file: filePath, startLine, endLine.
  
  Here is an example for how you should complete a task:
  - user:
    This is the selected element:
        ---
            <h1 className="bg-gradient-to-tr from-zinc-900 via-zinc-700 to-black bg-clip-text font-bold text-3xl text-transparent tracking-tight md:text-5xl dark:from-zinc-100 dark:via-zinc-300 dark:to-white">
              Simple, transparent pricing
            </h1>
        ---
    These are the file snippets you should pick the right one from:
      {
        relativePath: apps/website/src/app/(home)/pricing/page.tsx,
        content: "FRONTEND FILE\nA .tsx file with the name page.tsx from the file apps/website/src/app/(home)/pricing/page.tsx.\n\nCode:
        ---
          return (
    <div className="flex w-full max-w-6xl flex-col gap-12 px-4">
      <ScrollReveal>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative">
            <span className="glass-body -top-12 -translate-x-1/2 md:-top-2 absolute left-1/2 rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground text-sm backdrop-blur-sm md:left-full md:ml-4 md:translate-x-0">
              New
            </span>
            <h1 className="bg-gradient-to-tr from-zinc-900 via-zinc-700 to-black bg-clip-text font-bold text-3xl text-transparent tracking-tight md:text-5xl dark:from-zinc-100 dark:via-zinc-300 dark:to-white">
              Simple, transparent pricing
            </h1>
          </div>
          <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
            Start with a free trial, then upgrade to Pro for full access with
            generous usage limits included.
          </p>
        </div>
        ---,
        startLine: 0,
        endLine: 17,
      }, 
      {
        relativePath: apps/website/src/app/page.tsx,
        content: "FRONTEND FILE\nA .tsx file with the name page.tsx from the file apps/website/src/app/page.tsx.\n\nCode:
        ---
          <div className="flex items-start gap-4">
            <div className="glass-body flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 font-semibold text-sm text-violet-600 dark:bg-violet-400/20 dark:text-violet-400">
              3
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                Invoke the stagewise command
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Run the stagewise command and start building
              </p>
            </div>
          </div>
        ---

      }

  - assistant:
    relativePath: apps/website/src/app/(home)/pricing/page.tsx
    startLine: 0
    endLine: 17


  IMPORTANT: If the selected element could be both, a general UI component from a component library and a specific instance of this component in the codebase, pick the file snippet that is most likely to be the instance of this component in the codebase.
  `;

  const prompt = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `This is the selected element:\n\t---\n\t${JSON.stringify(element)}\n\t---\n\nThese are the file snippets you should pick the right one from:\n\t${JSON.stringify(
          snippetsWithLineNumbers,
        )}`,
      },
    ],
  } satisfies ModelMessage;

  const litellm = createAnthropic({
    apiKey: apiKey,
    baseURL: `${process.env.LLM_PROXY_URL}/v1`,
  });

  const response = await generateObject({
    schema: z.object({
      relativePath: z.string(),
      startLine: z.number(),
      endLine: z.number(),
    }),
    model: litellm('gemini-2.5-flash-lite'),
    messages: [{ role: 'system', content: fileSelectionPrompt }, prompt],
    temperature: 0.1,
  });

  return response.object;
}
