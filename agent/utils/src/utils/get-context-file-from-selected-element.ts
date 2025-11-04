import type { SelectedElement } from '@stagewise/karton-contract';
import { generateObject, generateText, type ModelMessage } from 'ai';
import { z } from 'zod';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import { queryRagWithoutRerank } from '@stagewise/agent-rag';
import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import * as fs from 'node:fs';
import * as path from 'node:path';

type RetrievalResult = {
  relativePath: string;
  content: string;
  startLine: number;
  endLine: number;
};

async function retrieveFilesForSelectedElement(
  element: SelectedElement,
  workspaceDataPath: string,
  model: LanguageModelV2,
  apiKey: string,
) {
  const descriptionPrompt = `
  You are a helpful assistant that identifies and describes the semantic and content of elements in a web application by looking at the DOM structure and selected elements. You should describe the elements as precisely as possible and include details.

  Example:
    - user:
        This is the selected element:
            - <div classNames="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800">
                <div classNames="flex items-center justify-between mb-4">
                  <h3 classNames="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Monthly Revenue</h3>
                  <span classNames="text-sm text-zinc-500 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">+12.5%</span>
                </div>
                <div classNames="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">$54,239</div>
                <p classNames="text-sm text-zinc-600 dark:text-zinc-400">Compared to $48,211 last month</p>
                <div classNames="mt-4 flex gap-2">
                  <button classNames="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">View Details</button>
                  <button classNames="border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-4 py-2 rounded-lg text-sm font-medium">Export</button>
                </div>
              </div>
            
    - assistant:
        A comprehensive revenue dashboard card displaying the current month's financial performance. The card features a white background in light mode and dark zinc background in dark mode, with rounded corners and a subtle shadow for depth. At the top, there's a header section with "Monthly Revenue" as the title aligned to the left, and a green-tinted badge showing "+12.5%" growth indicator on the right. The main content prominently displays "$54,239" as the current monthly revenue figure in large, bold typography. Below this, a comparison text states "Compared to $48,211 last month" in a muted gray color, providing context for the growth percentage. At the bottom, there are two action buttons: a primary blue "View Details" button that likely navigates to a detailed revenue breakdown page, and a secondary outlined "Export" button for downloading or exporting the revenue data. The entire component uses a consistent color scheme with proper dark mode support throughout, and the layout uses flexbox for alignment and spacing.

  IMPORTANT: Include text content and business logic of elements when possible (e.g. instead of saying: 'A rounded chip element with subtle shadow', say: 'A rounded chip element with subtle shadow that displays the latest monthly user growth percentage')

  IMPORTANT: Be very specific and detailed in your description, include information about:
  - Visual styling (colors, classes)
  - Text content and data being displayed
  - Surrounding children/ parent elements and their purpose and text content
  - The overall purpose and context of the component`;

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
    model,
    messages: [{ role: 'system', content: descriptionPrompt }, prompt],
    temperature: 0.1,
  });

  const retrievedFiles = await queryRagWithoutRerank(
    elementDescription.text,
    workspaceDataPath,
    apiKey,
    10,
  );

  return { retrievedFiles, elementDescription: elementDescription.text };
}

async function pickCorrectFileSnippetFromSnippets(
  element: SelectedElement,
  clientRuntime: ClientRuntime,
  snippets: RetrievalResult[],
  elementDescription: string,
  model: LanguageModelV2,
  onError?: (error: string) => void,
) {
  const cleanedSnippets: {
    relativePath: string;
    content: string;
    startLine: number;
    endLine: number;
  }[] = [];

  for (const snippet of snippets) {
    const _startLine = snippet.startLine - 500;
    const _endLine = snippet.endLine + 500;
    const startLine = Math.max(1, _startLine);
    const endLine = _endLine;

    const fileContent = await clientRuntime.fileSystem.readFile(
      snippet.relativePath,
      { startLine, endLine },
    );
    if (!fileContent.success || !fileContent.content) {
      onError?.(
        `Failed to read file ${snippet.relativePath}: ${fileContent.error} ${fileContent.message}`,
      );
      cleanedSnippets.push({
        relativePath: snippet.relativePath,
        content: snippet.content,
        startLine: snippet.startLine,
        endLine: snippet.endLine,
      });
    }
    cleanedSnippets.push({
      relativePath: snippet.relativePath,
      content: fileContent.content!,
      startLine: snippet.startLine,
      endLine: snippet.endLine,
    });
  }

  const snippetsWithLineNumbers = cleanedSnippets.map((s) => {
    const lines = s.content.split('\n');
    let codeStartIndex = -1;

    // Find the line with "Code:" followed by "---"
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i]?.includes('Code:') && lines[i + 1]?.trim() === '---') {
        codeStartIndex = i + 2; // Start after the "---" line
        break;
      }
    }

    const numberedLines = lines.map((line, index) => {
      if (codeStartIndex >= 0 && index >= codeStartIndex) {
        const lineNumber = index + 1;
        return `${lineNumber}: ${line}`;
      }
      return `${index + 1}: ${line}`;
    });

    return {
      relativePath: s.relativePath,
      startLine: s.startLine,
      endLine: s.endLine,
      content: numberedLines.join('\n'),
    };
  });

  const fileSelectionPrompt = `You are a helpful assistant that receives an excerpt of HTML ELements from a Browser DOM, as well as various file snippets that are potential candidates to be the source code of these HTML elements.

  YOUR_TASK: Pick the right file snippet that is most likely to be the source code of the included HTML Elements.

  OUTPUT_REQUIREMENTS: Output the following content to describe the picked file: filePath, startLine, endLine. If you cannot find the right file snippet or no file snippets are present, return an error message in the error field.
  
  Here is an example for how you should complete a task:
  - user:
    This is the natural language description of the selected element:
        ---
        A pricing page with a title and a description.
        ---
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


    IMPORTANT: Prefer selecting code snippets that are more specific to the selected element, over general code snippets that are more likely to be a component library.
  `;

  const prompt = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `This is the natural language description of the selected element:\n\t---\n\t${elementDescription}\n\t---\n\nThis is the selected element:\n\t---\n\t${JSON.stringify(element)}\n\t---\n\nThese are the file snippets you should pick the right one from:\n\t${JSON.stringify(
          snippetsWithLineNumbers.map((s) => ({
            relativePath: s.relativePath,
            content: s.content,
            startLine: s.startLine,
            endLine: s.endLine,
          })),
        )}`,
      },
    ],
  } satisfies ModelMessage;

  try {
    const response = await generateObject({
      schema: z.object({
        relativePath: z.string(),
        startLine: z.number(),
        endLine: z.number(),
        error: z
          .string()
          .describe(
            'The error message if no file was found, otherwise undefined',
          )
          .optional(),
      }),
      model,
      messages: [{ role: 'system', content: fileSelectionPrompt }, prompt],
      temperature: 0.1,
    });
    return response.object;
  } catch (e) {
    return {
      error: `Failed to pick correct file snippet from snippets: ${e}`,
    };
  }
}

/**
 * Retrieves the context file from the selected element.
 * @param element The element to get the context file from.
 * @param apiKey The API key to use for the LLM.
 * @param workspaceDataPath The path to the workspace data.
 * @returns The context file.
 */
export async function getContextFileFromSelectedElement(
  element: SelectedElement,
  apiKey: string,
  workspaceDataPath: string,
  model: LanguageModelV2,
  clientRuntime: ClientRuntime,
  onError?: (error: string) => void,
): Promise<
  | { relativePath: string; startLine: number; endLine: number }
  | { error: string }
> {
  try {
    const { retrievedFiles, elementDescription } =
      await retrieveFilesForSelectedElement(
        element,
        workspaceDataPath,
        model,
        apiKey,
      );

    const correctFileSnippet = await pickCorrectFileSnippetFromSnippets(
      element,
      clientRuntime,
      retrievedFiles.map((f) => ({
        relativePath: f.relative_path,
        content: f.content,
        startLine: f.start_line,
        endLine: f.end_line,
      })),
      elementDescription,
      model,
      onError,
    );

    if ('error' in correctFileSnippet && correctFileSnippet.error) {
      return { error: correctFileSnippet.error };
    }
    if ('relativePath' in correctFileSnippet) {
      return {
        relativePath: correctFileSnippet.relativePath,
        startLine: correctFileSnippet.startLine,
        endLine: correctFileSnippet.endLine,
      };
    } else return { error: correctFileSnippet.error };
  } catch (e) {
    return { error: `Failed to get file snippet from selected element: ${e}` };
  }
}
