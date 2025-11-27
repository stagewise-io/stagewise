import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';
import type {
  AppRouter,
  TRPCClient,
  SearchResultWeb,
  SearchResultNews,
  Document,
} from '@stagewise/api-client';
import { TOOL_OUTPUT_LIMITS } from '../../constants';
import { capToolOutput } from '../../utils/tool-output-capper';
import { rethrowCappedToolOutputError } from '../../utils/error';

export const DESCRIPTION = `Search the web for information.

Parameters:
- query (string, REQUIRED): Query to search the web for.
- explanation (string, REQUIRED): One sentence explaining why this tool is being used.`;

export const webSearchParamsSchema = z.object({
  query: z.string().describe('Query to search the web for.'),
  explanation: z
    .string()
    .describe('One sentence explaining why this tool is being used.'),
});

export type WebSearchParams = z.infer<typeof webSearchParamsSchema>;

export async function webSearchToolExecute(
  params: WebSearchParams,
  apiClient: TRPCClient<AppRouter>,
) {
  const { query, explanation } = params;

  try {
    const response = await apiClient.firecrawl.search.query({
      query,
      limit: 10,
      sources: ['web', 'news'],
    });
    const webResults: SearchResultWeb[] =
      response.web
        ?.map((r) => {
          if (!('url' in r)) return null;
          return {
            url: r.url,
            title: r.title,
            description: r.description,
          };
        })
        .filter((r) => r !== null) || [];
    const newsResults: (Document | SearchResultNews)[] = response.news || [];
    const results = [...webResults, ...newsResults];
    const capped = capToolOutput(results, {
      maxBytes: TOOL_OUTPUT_LIMITS.READ_FILE.MAX_TOTAL_OUTPUT_SIZE,
      maxItems: 20,
    });
    const message = capped.truncated
      ? `Successfully searched the web for information: ${query} (The result was truncated. Original size: ${capped.originalSize}, capped size: ${capped.cappedSize})`
      : `Successfully searched the web for information: ${query}`;
    return {
      message,
      query,
      explanation,
      results: capped.result,
      truncated: capped.truncated,
      itemsRemoved: capped.itemsRemoved,
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const webSearchTool = (apiClient: TRPCClient<AppRouter>) =>
  tool({
    name: 'web_search',
    description: DESCRIPTION,
    inputSchema: webSearchParamsSchema,
    execute: async (args) => {
      return validateToolOutput(await webSearchToolExecute(args, apiClient));
    },
  });
