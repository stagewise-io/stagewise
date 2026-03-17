import {
  type SearchInLibraryDocsToolInput,
  searchInLibraryDocsToolInputSchema,
} from '@shared/karton-contracts/ui/agent/tools/types';
import type { ApiClient } from '@stagewise/api-client';
import { tool } from 'ai';
import {
  rethrowCappedToolOutputError,
  capToolOutput,
  extractEdenErrorMessage,
} from '../../utils';

/* Due to an issue in zod schema conversion in the ai sdk,
   the schema descriptions are not properly used for the prompts -
   thus, we include them in the descriptions as well. */
export const DESCRIPTION = `Get up to date documentation for a given library id and topic. 

Parameters:
- packageId (string, REQUIRED): Package ID for which docs should be searched
- topic (string, REQUIRED): Topic to search for in the docs`;

export async function searchInLibraryDocsToolExecute(
  params: SearchInLibraryDocsToolInput,
  apiClient: ApiClient,
) {
  const { libraryId, topic } = params;

  try {
    const { data: response, error } = await apiClient.v1.context7.docs.get({
      query: {
        libraryId,
        query: topic,
        type: 'txt',
      },
    });

    if (error) throw new Error(extractEdenErrorMessage(error));

    // The `type: 'txt'` query param makes the server return plain text at
    // runtime, but the Eden Treaty type always reflects the JSON shape.
    const cappedResponse = capToolOutput(response as unknown as string);

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

export const searchInLibraryDocs = (apiClient: ApiClient) =>
  tool({
    description: DESCRIPTION,
    inputSchema: searchInLibraryDocsToolInputSchema,
    strict: true,
    execute: async (args) => {
      return searchInLibraryDocsToolExecute(args, apiClient);
    },
  });
