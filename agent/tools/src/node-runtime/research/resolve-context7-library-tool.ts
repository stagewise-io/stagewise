import { tool } from 'ai';
import { validateToolOutput } from '../../index.js';
import { z } from 'zod';
import type { AppRouter, TRPCClient } from '@stagewise/api-client';
import { TOOL_OUTPUT_LIMITS } from '../../constants.js';
import { capToolOutput } from '../../utils/tool-output-capper.js';
import { rethrowCappedToolOutputError } from '../../utils/error.js';

export const DESCRIPTION = `Use this tool to start searching for library documentation. 
It will return a list of context7 library ids and titles that are relevant to the library name.
You can then use the getContext7LibraryDocs tool to get the documentation for a given context7 library id and topic.

Parameters:
- library (string, REQUIRED): Library name to resolve the context7 library id for.`;

export const resolveContext7LibraryParamsSchema = z.object({
  library: z
    .string()
    .describe('Library name to resolve the context7 library id for.'),
});

export type ResolveContext7LibraryParams = z.infer<
  typeof resolveContext7LibraryParamsSchema
>;

export async function resolveContext7LibraryToolExecute(
  params: ResolveContext7LibraryParams,
  apiClient: TRPCClient<AppRouter>,
) {
  const { library } = params;

  try {
    const response = await apiClient.context7.search.query({ query: library });
    const results = response.results.map((r) => ({
      libraryId: r.id,
      title: r.title,
      description: r.description,
      trustScore: r.trustScore,
      versions: r.versions,
    }));

    const capped = capToolOutput(results, {
      maxBytes: TOOL_OUTPUT_LIMITS.READ_FILE.MAX_TOTAL_OUTPUT_SIZE,
      maxItems: 20,
    });
    const message = capped.truncated
      ? `Successfully searched for documentation for library: ${library} (The result was truncated. Original size: ${capped.originalSize}, capped size: ${capped.cappedSize})`
      : `Successfully searched for documentation for library: ${library}`;
    return {
      message,
      library,
      results: capped.result,
      truncated: capped.truncated,
      itemsRemoved: capped.itemsRemoved,
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const resolveContext7LibraryTool = (apiClient: TRPCClient<AppRouter>) =>
  tool({
    description: DESCRIPTION,
    inputSchema: resolveContext7LibraryParamsSchema,
    execute: async (args) => {
      return validateToolOutput(
        await resolveContext7LibraryToolExecute(args, apiClient),
      );
    },
  });
