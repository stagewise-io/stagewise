import {
  type ListLibraryDocsToolInput,
  listLibraryDocsToolInputSchema,
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
export const DESCRIPTION = `Finds a list of libraries that match the given name and for which documentation exists. Use to find correct library ID before search inside the library docs.

Parameters:
- name (string, REQUIRED): Library name for which to search for matches`;

export async function listPackageDocsToolExecute(
  params: ListLibraryDocsToolInput,
  apiClient: ApiClient,
) {
  const { name } = params;

  try {
    const { data: response, error } = await apiClient.v1.context7.search.get({
      query: { libraryName: name, query: name },
    });
    if (error) throw new Error(extractEdenErrorMessage(error));
    const results = response.results.map((r) => ({
      libraryId: r.id,
      title: r.title,
      description: r.description,
      trustScore: r.trustScore,
      versions: r.versions,
    }));

    const capped = capToolOutput(results);
    const message = capped.truncated
      ? `Successfully searched for documentation for library: ${name} (The result was truncated. Original size: ${capped.originalSize}, capped size: ${capped.cappedSize})`
      : `Successfully searched for documentation for library: ${name}`;
    return {
      message,
      name,
      results: capped.result,
      truncated: capped.truncated,
      itemsRemoved: capped.itemsRemoved,
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}

export const listLibraryDocs = (apiClient: ApiClient) =>
  tool({
    description: DESCRIPTION,
    inputSchema: listLibraryDocsToolInputSchema,
    execute: async (args) => {
      return listPackageDocsToolExecute(args, apiClient);
    },
  });
