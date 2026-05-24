import { createApiClient } from '@stagewise/api-client';
import { createHash, randomBytes } from 'node:crypto';
import { shell } from 'electron';
import { createAuthClient } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import { electronClient } from '@better-auth/electron/client';
import type { Logger } from '../logger';
import { AUTH_CALLBACK_SCHEME } from './callback-scheme';
import type {
  CurrentUsageResponse,
  UsageHistoryResponse,
} from '@shared/karton-contracts/pages-api/types';
import type { SocialAuthProvider } from '@shared/karton-contracts/ui/shared-types';

export const API_URL = process.env.API_URL || 'https://api.stagewise.io';
const ELECTRON_CLIENT_ID = 'electron';
// @better-auth/electron stores Electron OAuth PKCE code verifiers in this
// process-global map keyed by OAuth state. Our API-hosted handoff constructs
// the same PKCE request manually, so it must seed the official store before
// calling `authClient.authenticate({ token })`.
const ELECTRON_AUTH_STORE = Symbol.for('better-auth:electron');

type BetterAuthClientOptions = {
  plugins: [
    ReturnType<typeof emailOTPClient>,
    ReturnType<typeof electronClient>,
  ];
};

export type BetterAuthClient = ReturnType<
  typeof createAuthClient<BetterAuthClientOptions>
>;

export type SocialAuthRedirectTarget =
  | { kind: 'custom-scheme'; scheme: string }
  | { kind: 'loopback'; callbackUrl: string };

function getElectronAuthStore(): Map<string, string> {
  const globalStore = globalThis as Record<
    symbol,
    Map<string, string> | undefined
  >;
  let store = globalStore[ELECTRON_AUTH_STORE];
  if (!store) {
    store = new Map<string, string>();
    globalStore[ELECTRON_AUTH_STORE] = store;
  }
  return store;
}

function createBase64UrlRandomString(byteLength: number): string {
  return randomBytes(byteLength).toString('base64url');
}

export async function openSocialAuthInSystemBrowser(
  provider: SocialAuthProvider,
  redirectTarget: SocialAuthRedirectTarget = {
    kind: 'custom-scheme',
    scheme: AUTH_CALLBACK_SCHEME,
  },
): Promise<void> {
  const state = createBase64UrlRandomString(16);
  const codeVerifier = createBase64UrlRandomString(32);
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  const authStore = getElectronAuthStore();
  authStore.set(state, codeVerifier);

  const url = new URL(`${API_URL}/v1/auth/electron/start`);
  url.searchParams.set('provider', provider);
  url.searchParams.set('client_id', ELECTRON_CLIENT_ID);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  if (redirectTarget.kind === 'loopback') {
    url.searchParams.set('callback_url', redirectTarget.callbackUrl);
  } else {
    url.searchParams.set('callback_scheme', redirectTarget.scheme);
  }

  try {
    await shell.openExternal(url.toString(), { activate: true });
  } catch (error) {
    authStore.delete(state);
    throw error;
  }
}

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
    baseURL: API_URL,
    basePath: '/v1/auth',
    disableDefaultFetchPlugins: true,
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
    plugins: [
      emailOTPClient(),
      electronClient({
        protocol: {
          scheme: AUTH_CALLBACK_SCHEME,
        },
        signInURL: `${API_URL}/v1/auth/electron/start`,
        // Session persistence is handled by AuthService's encrypted
        // `auth-session` store. The Electron plugin still requires a storage
        // adapter for cookie/cache helpers, but this client uses bearer tokens
        // and the API handoff, so those plugin-backed values are intentionally
        // not persisted here.
        storage: {
          getItem: () => null,
          setItem: () => {},
        },
      }),
    ],
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
