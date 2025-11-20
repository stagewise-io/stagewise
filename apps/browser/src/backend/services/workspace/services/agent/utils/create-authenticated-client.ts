import { createNodeApiClient, type TRPCClient } from '@stagewise/api-client';
import type { AppRouter } from '@stagewise/api-client';

export function createAuthenticatedClient(
  accessToken: string,
): TRPCClient<AppRouter> {
  try {
    const headers = { Authorization: `Bearer ${accessToken}` };

    return createNodeApiClient({
      fetch: fetch,
      headers,
    });
  } catch (error) {
    console.error(
      '[createAuthenticatedClient]: Error creating authenticated client',
      error,
    );
    throw error;
  }
}
