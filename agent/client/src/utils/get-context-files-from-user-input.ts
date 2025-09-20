import type { UserInputUpdate } from '@stagewise/karton-contract';
import type { TextUIPart } from '@stagewise/karton-contract';
import { generateText, type ModelMessage } from 'ai';
import { LevelDb } from '@stagewise/agent-rag';
import { queryRagWithoutRerank } from '@stagewise/agent-rag';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { createAnthropic } from '@ai-sdk/anthropic';
import type {
  ComponentLibraryInformation,
  StyleInformation,
} from '@stagewise/agent-rag';

const system = `You are a helpful assistant that describes the semantic of elements in a web application by looking at the DOM structure and selected elements.

Example:
- user:
  These are the selected elements:
  - <input type="text" id="search-input" placeholder="Search..." classNames="w-full text-blue-500 bg-white">
  - <button id="search-button" classNames="bg-red-500 text-white">Search</button>

- assistant:
  A white search input with blue text with a search button with a red background and white text that triggers a search action.
`;

async function getFileSnippet(
  file: Awaited<ReturnType<typeof queryRagWithoutRerank>>[number],
  _clientRuntime: ClientRuntime,
) {
  return JSON.stringify({
    relativePath: file.relativePath,
    relevance: (1 - file.distance).toFixed(2),
    content: file.content,
  });
}

async function _getComponentInformation(clientRuntime: ClientRuntime) {
  const db = LevelDb.getInstance(clientRuntime);
  await db.open();
  const componentInformation: ComponentLibraryInformation[] = [];
  for await (const [_key, value] of db.component.iterator()) {
    componentInformation.push(value);
  }
  await db.close();
  return JSON.stringify(componentInformation, null, 2);
}

async function getStyleInformation(clientRuntime: ClientRuntime) {
  const db = LevelDb.getInstance(clientRuntime);
  await db.open();
  const styleInformation: StyleInformation[] = [];
  for await (const [_key, value] of db.style.iterator()) {
    styleInformation.push(value);
  }
  await db.close();
  return JSON.stringify(styleInformation, null, 2);
}

async function _getRouteFileSnippets(
  userInput: UserInputUpdate,
  clientRuntime: ClientRuntime,
) {
  const db = LevelDb.getInstance(clientRuntime);
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
  const fileSnippets: string[] = [];
  for (const filePath of filePaths) {
    const file = await clientRuntime.fileSystem.readFile(filePath);
    if (!file.success) continue;
    fileSnippets.push(
      JSON.stringify({
        relativePath: filePath,
        content: file.content,
      }),
    );
  }
  return fileSnippets;
}

async function retrieveFilesForSelectedElements(
  userInput: UserInputUpdate,
  clientRuntime: ClientRuntime,
  apiKey: string,
) {
  const litellm = createAnthropic({
    apiKey: apiKey,
    baseURL: `${process.env.LLM_PROXY_URL}/v1`,
  });

  const selectedElements = userInput.browserData?.selectedElements;

  const prompt = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `These are the selected elements: \n\n${JSON.stringify(selectedElements)}`,
      },
    ],
  } satisfies ModelMessage;

  const response = await generateText({
    model: litellm('gemini-2.5-flash-lite'),
    messages: [{ role: 'system', content: system }, prompt],
    temperature: 0.1,
  });

  const retrievedFiles = await queryRagWithoutRerank(
    response.text,
    clientRuntime,
    apiKey,
    10,
  );

  return retrievedFiles;
}

export async function getContextFilesFromUserInput(
  userInput: UserInputUpdate,
  apiKey: string,
  clientRuntime: ClientRuntime,
): Promise<TextUIPart[]> {
  try {
    // const componentInformation = await getComponentInformation(clientRuntime);
    const styleInformation = await getStyleInformation(clientRuntime);
    // const routeFileSnippets = await getRouteFileSnippets(
    //   userInput,
    //   clientRuntime,
    // );

    const retrievedFiles = await retrieveFilesForSelectedElements(
      userInput,
      clientRuntime,
      apiKey,
    );

    for (const file of retrievedFiles) {
      console.log(
        `${file.relativePath} - distance: ${file.distance} - content: \n${file.content}`,
      );
    }

    const styleExplanationPart: TextUIPart = {
      type: 'text',
      text: `This is the style information for the web application you are working on:\n`,
    };

    // const componentExplanationPart: TextUIPart = {
    //   type: 'text',
    //   text: `These are component configurations for the web project you are working on.`,
    // };

    const filesExplanationPart: TextUIPart = {
      type: 'text',
      text: `These are the relevant file snippets for the user's request. Read the files by using their file path if you need more information.`,
    };

    const fileParts: TextUIPart[] = [];
    fileParts.push(styleExplanationPart);
    fileParts.push({
      type: 'text',
      text: styleInformation,
    });

    // fileParts.push(componentExplanationPart);
    // fileParts.push({
    //   type: 'text',
    //   text: componentInformation,
    // });

    fileParts.push(filesExplanationPart);
    for (const file of retrievedFiles) {
      const fileSnippet = await getFileSnippet(file, clientRuntime);
      fileParts.push({
        type: 'text',
        text: fileSnippet,
      });
    }

    // for (const file of routeFileSnippets) {
    //   fileParts.push({
    //     type: 'text',
    //     text: file,
    //   });
    // }

    return fileParts;
  } catch (_error) {
    return [];
  }
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
