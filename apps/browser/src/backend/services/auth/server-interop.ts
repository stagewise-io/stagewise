import { createApiClient } from '@stagewise/api-client';
import { createAuthClient } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import type { Logger } from '../logger';
import type {
  CurrentUsageResponse,
  UsageHistoryResponse,
} from '@shared/karton-contracts/pages-api/types';

export const API_URL = process.env.API_URL || 'https://v1.api.stagewise.io';
const AUTH_URL = process.env.AUTH_URL || API_URL;

type BetterAuthClientOptions = {
  plugins: [ReturnType<typeof emailOTPClient>];
};

export type BetterAuthClient = ReturnType<
  typeof createAuthClient<BetterAuthClientOptions>
>;

/**
 * Creates a better-auth client for the Electron main process.
 *
 * Uses bearer token auth (stored in our encrypted credential store)
 * instead of browser cookies. The `getToken` callback lets the
 * AuthService supply the current persisted token lazily.
 *
 * `onTokenReceived` is called whenever any response includes a
 * `set-auth-token` header, handling both initial sign-in and
 * automatic token refreshes from `getSession()`.
 */
export function createBetterAuthClient(
  getToken: () => string | null,
  onTokenReceived: (token: string) => void,
): BetterAuthClient {
  return createAuthClient({
    baseURL: AUTH_URL,
    basePath: '/v1/auth',
    disableDefaultFetchPlugins: true,
    plugins: [emailOTPClient()],
    fetchOptions: {
      auth: {
        type: 'Bearer',
        token: () => getToken() ?? '',
      },
      onSuccess: (ctx) => {
        const authToken = ctx.response.headers.get('set-auth-token');
        if (authToken) {
          onTokenReceived(authToken);
        }
      },
    },
  });
}

/**
 * Interop layer for backend API calls that require authentication.
 * Handles subscription/plan queries via the REST API.
 */
export class AuthServerInterop {
  private logger: Logger;

  public constructor(logger: Logger) {
    this.logger = logger;
  }

  public async getSubscription(accessToken: string) {
    const client = createApiClient(API_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const SUBSCRIPTION_TIMEOUT_MS = 15_000;
    const subscriptionData = await Promise.race([
      client.v1.billing.plan.get().then(({ data, error }) => {
        if (error) throw new Error(String(error));
        return data;
      }),
      new Promise<null>((_, reject) =>
        setTimeout(
          () => reject(new Error('Subscription query timed out')),
          SUBSCRIPTION_TIMEOUT_MS,
        ),
      ),
    ]).catch((err) => {
      this.logger.error(
        `[AuthServerInterop] Failed to get subscription: ${err}`,
      );
      return null;
    });

    this.logger.debug(
      `[AuthServerInterop] Subscription data: ${JSON.stringify(subscriptionData)}`,
    );

    return subscriptionData;
  }

  public async getUsageCurrent(
    accessToken: string,
  ): Promise<CurrentUsageResponse> {
    const client = createApiClient(API_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const { data, error } = await client.v1.usage.current.get();
    if (error) {
      throw new Error(
        typeof error === 'string'
          ? error
          : ((error as { message?: string }).message ?? JSON.stringify(error)),
      );
    }
    return data as CurrentUsageResponse;
  }

  public async getUsageHistory(
    accessToken: string,
    days = 30,
  ): Promise<UsageHistoryResponse> {
    const client = createApiClient(API_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const { data, error } = await client.v1.usage.history.get({
      query: { days: String(days) },
    });
    if (error) throw new Error(String(error));
    return data as UsageHistoryResponse;
  }
}
