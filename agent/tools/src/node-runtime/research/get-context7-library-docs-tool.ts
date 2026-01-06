import { tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';
import type { AppRouter, TRPCClient } from '@stagewise/api-client';
import { TOOL_OUTPUT_LIMITS } from '../../constants';
import { capToolOutput } from '../../utils/tool-output-capper';
import { rethrowCappedToolOutputError } from '../../utils/error';

export const DESCRIPTION = `Get up to date documentation for a given context7 library id and topic. 

Parameters:
- libraryId (string, REQUIRED): Context7 library id to get the documentation for.
- topic (string, REQUIRED): Topic to get the documentation for.
- mode (enum, OPTIONAL): Mode to get the documentation for. Defaults to 'code'.
- page (number, OPTIONAL): Page to get the documentation for. Defaults to 1.`;

export const getContext7LibraryDocsParamsSchema = z.object({
  libraryId: z
    .string()
    .describe('Context7 library id to get the documentation for.'),
  topic: z.string().describe('Topic to get the documentation for.'),
  mode: z
    .enum(['code', 'info'])
    .describe('Mode to get the documentation for.')
    .default('code'),
  page: z.number().describe('Page to get the documentation for.').default(1),
});

export type GetContext7LibraryDocsParams = z.infer<
  typeof getContext7LibraryDocsParamsSchema
>;

export async function getContext7LibraryDocsToolExecute(
  params: GetContext7LibraryDocsParams,
  apiClient: TRPCClient<AppRouter>,
) {
  const { libraryId, topic, mode, page } = params;

  try {
    const response = (await apiClient.context7.docs.query({
      libraryId,
      topic,
      mode,
      page,
      type: 'txt',
    })) as string;

    const cappedResponse = capToolOutput(response, {
      maxBytes: TOOL_OUTPUT_LIMITS.READ_FILE.MAX_TOTAL_OUTPUT_SIZE,
      maxItems: 20,
    });

    const message = cappedResponse.truncated
      ? `Successfully searched for documentation for library: ${libraryId} (The result was truncated. Original size: ${cappedResponse.originalSize}, capped size: ${cappedResponse.cappedSize})`
      : `Successfully searched for documentation for library: ${libraryId}`;
    return {
      message,
      content: cappedResponse.result,
      truncated: cappedResponse.truncated,
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const getContext7LibraryDocsTool = (apiClient: TRPCClient<AppRouter>) =>
  tool({
    description: DESCRIPTION,
    inputSchema: getContext7LibraryDocsParamsSchema,
    execute: async (args) => {
      return validateToolOutput(
        await getContext7LibraryDocsToolExecute(args, apiClient),
      );
    },
  });
