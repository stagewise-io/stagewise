import type { UserInputUpdate } from '@stagewise/karton-contract';
import type { TextUIPart } from '@stagewise/karton-contract';
import { generateText, type ModelMessage } from 'ai';
import { queryRagWithoutRerank } from '@stagewise/agent-rag';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { createAnthropic } from '@ai-sdk/anthropic';

const system = `You are a helpful assistant that describes the semantic of elements in a web application by looking at the DOM structure and selected elements.

Example:
- user:
  These are the selected elements:
  - <input type="text" id="search-input" placeholder="Search..." classNames="w-full text-blue-500 bg-white">
  - <button id="search-button" classNames="bg-blue-500 text-white">Search</button>

- assistant:
  A white search input with blue text with a search button with a blue background and white text that triggers a search action.
`;

async function getFileSnippet(
  file: Awaited<ReturnType<typeof queryRagWithoutRerank>>[number],
  _clientRuntime: ClientRuntime,
) {
  return `
    <file_path>
      ${file.relativePath}
    </file_path>
    <relevance>
      ${(1 - file.distance).toFixed(2)}
    </relevance>
    <content>
      ${file.content}
    </content>
    `;
}

export async function getContextFilesFromUserInput(
  userInput: UserInputUpdate,
  apiKey: string,
  clientRuntime: ClientRuntime,
): Promise<TextUIPart[]> {
  try {
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
      model: litellm('gemini-2.5-flash'),
      messages: [{ role: 'system', content: system }, prompt],
    });

    const retrievedFiles = await queryRagWithoutRerank(
      response.text,
      clientRuntime,
      apiKey,
      8,
    );
    // Filter out duplicate files by relativePath, keeping only the first occurrence
    // const uniqueRetrievedFiles = retrievedFiles.filter(
    //   (file, index, arr) =>
    //     arr.findIndex((f) => f.relativePath === file.relativePath) === index,
    // );

    // const fileSnippets = await Promise.all(
    //   uniqueRetrievedFiles.map((file) => getFileSnippet(file, clientRuntime)),
    // );
    const fileSnippets = await Promise.all(
      retrievedFiles.map((file) => getFileSnippet(file, clientRuntime)),
    );

    const part: TextUIPart = {
      type: 'text',
      text: `These are the relevant files for the user's request: \n\n${fileSnippets.join('\n')}`,
    };

    return [part];
  } catch (error) {
    console.error('\n\nerror', error, '\n\n');
    return [];
  }
}
