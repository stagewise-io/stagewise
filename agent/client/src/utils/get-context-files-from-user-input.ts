import type { UserInputUpdate } from '@stagewise/karton-contract';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { TextUIPart } from '@stagewise/karton-contract';
import { generateText, type ModelMessage } from 'ai';
import { queryRag } from '@stagewise/agent-rag';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';

const system = `You are a helpful assistant that describes the semantic of elements in a web application by looking at the DOM structure and selected elements.

Example:
- user:
  These are the selected elements:
  - <input type="text" id="search-input" placeholder="Search..." classNames="w-full text-blue-500 bg-white">
  - <button id="search-button" classNames="bg-blue-500 text-white">Search</button>

- assistant:
  A white search input with blue text with a search button with a blue background and white text that triggers a search action.
`;

function getFileSnippet(file: Awaited<ReturnType<typeof queryRag>>[number]) {
  return `
  <file_path>
    ${file.filePath}
  </file_path>
  <relevance>
    ${file.distance.toFixed(2)}
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
    const google = createGoogleGenerativeAI({
      apiKey: apiKey,
      baseURL: `${process.env.API_URL}/google/v1beta`,
      headers: { 'stagewise-access-key': apiKey },
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
      model: google('gemini-2.5-flash'),
      messages: [{ role: 'system', content: system }, prompt],
    });

    const retrievedFiles = await queryRag(
      response.text,
      clientRuntime,
      apiKey,
      15,
    );

    for (const file of retrievedFiles) {
      console.log('\nfile distance', file.distance);
      console.log('file path', file.filePath);
    }

    const part: TextUIPart = {
      type: 'text',
      text: `These are the relevant files for the user's request: \n\n${retrievedFiles.map((file) => getFileSnippet(file)).join('\n')}`,
    };

    return [part];
  } catch (error) {
    console.error('\n\nerror', error, '\n\n');
    return [];
  }
}
