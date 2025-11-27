import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';
import type { AppRouter, TRPCClient } from '@stagewise/api-client';
import { TOOL_OUTPUT_LIMITS } from '../../constants';
import { capToolOutput } from '../../utils/tool-output-capper';
import { rethrowCappedToolOutputError } from '../../utils/error';

export const DESCRIPTION = `Fetch the markdown content of a web page.

Parameters:
- url (string, REQUIRED): URL of the web page to fetch.
- explanation (string, REQUIRED): One sentence explaining why this tool is being used.`;

export const webFetchParamsSchema = z.object({
  url: z.string().describe('URL of the web page to fetch.'),
  explanation: z
    .string()
    .describe('One sentence explaining why this tool is being used.'),
});

export type WebFetchParams = z.infer<typeof webFetchParamsSchema>;

export async function webFetchToolExecute(
  params: WebFetchParams,
  apiClient: TRPCClient<AppRouter>,
) {
  const { url, explanation } = params;

  try {
    const response = await apiClient.firecrawl.scrape.query({
      url,
      formats: ['markdown'],
    });
    const md = response.markdown;
    if (md) {
      const capped = capToolOutput(md, {
        maxBytes: TOOL_OUTPUT_LIMITS.READ_FILE.MAX_TOTAL_OUTPUT_SIZE,
      });
      const message = capped.truncated
        ? `Successfully fetched the markdown content of the web page: ${url} (The result was truncated. Original size: ${capped.originalSize}, capped size: ${capped.cappedSize})`
        : `Successfully fetched the markdown content of the web page: ${url}`;
      return {
        message,
        result: {
          url,
          explanation,
          content: capped.result,
        },
      };
    }
    return {
      message: 'Success',
      url,
      explanation,
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const webFetchTool = (apiClient: TRPCClient<AppRouter>) =>
  tool({
    name: 'web_fetch',
    description: DESCRIPTION,
    inputSchema: webFetchParamsSchema,
    execute: async (args) => {
      return validateToolOutput(await webFetchToolExecute(args, apiClient));
    },
  });
