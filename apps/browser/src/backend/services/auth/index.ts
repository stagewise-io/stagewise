import type { KartonContract } from '@shared/karton-contracts/ui';
import type {
  CurrentUsageResponse,
  UsageHistoryResponse,
} from '@shared/karton-contracts/pages-api/types';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import {
  AuthServerInterop,
  createBetterAuthClient,
  type BetterAuthClient,
} from './server-interop';
import type { NotificationService } from '../notification';
import type { IdentifierService } from '../identifier';
import { DisposableService } from '../disposable';
import { z } from 'zod';
import {
  readPersistedData,
  writePersistedData,
} from '../../utils/persisted-data';
import {
  validateApiKeys,
  type ApiKeysInput,
} from '../../utils/validate-api-keys';

const CREDENTIALS_KEY = 'auth-session' as const;

const credentialsSchema = z
  .object({
    token: z.string(),
    user: z
      .object({
        id: z.string(),
        email: z.string().optional(),
        name: z.string().optional(),
      })
      .optional(),
  })
  .nullable();

type StoredCredentials = z.infer<typeof credentialsSchema>;

export type AuthState = KartonContract['state']['userAccount'];

const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class AuthService extends DisposableService {
  private readonly identifierService: IdentifierService;
  private readonly uiKarton: KartonService;
  private readonly notificationService: NotificationService;
  private readonly logger: Logger;

  private _credentials: StoredCredentials = null;
  private serverInterop: AuthServerInterop;
  private authClient: BetterAuthClient;

  private _refreshInterval: NodeJS.Timeout | null = null;
  private authChangeCallbacks: ((newAuthState: AuthState) => void)[] = [];

  private constructor(
    identifierService: IdentifierService,
    uiKarton: KartonService,
    notificationService: NotificationService,
    logger: Logger,
  ) {
    super();
    this.identifierService = identifierService;
    this.uiKarton = uiKarton;
    this.notificationService = notificationService;
    this.logger = logger;
    this.serverInterop = new AuthServerInterop(logger);
    this.authClient = createBetterAuthClient(
      () => this._credentials?.token ?? null,
      (token) => {
        this.persistCredentials({
          ...this._credentials,
          token,
        });
        this.logger.debug('[AuthService] Token captured/refreshed');
      },
    );
  }

  private persistCredentials(credentials: StoredCredentials): void {
    this._credentials = credentials;
    void writePersistedData(CREDENTIALS_KEY, credentialsSchema, credentials, {
      encrypt: true,
    });
  }

  private async initialize(): Promise<void> {
    const persisted = await readPersistedData(
      CREDENTIALS_KEY,
      credentialsSchema,
      null,
      { encrypt: true },
    );

    if (persisted?.token) {
      this._credentials = persisted;
      this.logger.debug(
        '[AuthService] Restored persisted credentials, validating session...',
      );

      await this.refreshSession();
    } else {
      this.updateAuthState((draft) => {
        draft.userAccount = {
          status: 'unauthenticated',
          machineId: this.identifierService.getMachineId(),
        };
      });
    }

    this._refreshInterval = setInterval(() => {
      if (this._credentials?.token) {
        void this.refreshSession();
      }
    }, SESSION_REFRESH_INTERVAL_MS);

    this.registerProcedureHandlers();
    this.logger.debug('[AuthService] Initialized');
  }

  private registerProcedureHandlers(): void {
    this.uiKarton.registerServerProcedureHandler(
      'userAccount.sendOtp',
      async (_callingClientId: string, email: string) => {
        return this.sendOtp(email);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'userAccount.verifyOtp',
      async (_callingClientId: string, email: string, code: string) => {
        return this.verifyOtp(email, code);
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'userAccount.logout',
      async (_callingClientId: string) => {
        await this.logout();
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'userAccount.refreshStatus',
      async (_callingClientId: string) => {
        await this.refreshSession();
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'userAccount.validateApiKeys',
      async (_callingClientId: string, keys: ApiKeysInput) => {
        this.logger.debug('[AuthService] Validating API keys');
        return validateApiKeys(keys);
      },
    );
  }

  public static async create(
    identifierService: IdentifierService,
    uiKarton: KartonService,
    notificationService: NotificationService,
    logger: Logger,
  ): Promise<AuthService> {
    const authService = new AuthService(
      identifierService,
      uiKarton,
      notificationService,
      logger,
    );
    await authService.initialize();
    return authService;
  }

  protected onTeardown(): void {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
    }

    this.uiKarton.removeServerProcedureHandler('userAccount.sendOtp');
    this.uiKarton.removeServerProcedureHandler('userAccount.verifyOtp');
    this.uiKarton.removeServerProcedureHandler('userAccount.logout');
    this.uiKarton.removeServerProcedureHandler('userAccount.refreshStatus');
    this.uiKarton.removeServerProcedureHandler('userAccount.validateApiKeys');
    this.authChangeCallbacks = [];

    this.logger.debug('[AuthService] Teardown complete');
  }

  // ---------------------------------------------------------------------------
  // OTP flow
  // ---------------------------------------------------------------------------

  public async sendOtp(email: string): Promise<{ error?: string }> {
    try {
      const { error } = await this.authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });
      if (error) {
        this.logger.error(`[AuthService] Failed to send OTP: ${error.message}`);
        return { error: error.message };
      }
      this.logger.debug(`[AuthService] OTP sent to ${email}`);
      return {};
    } catch (err) {
      this.logger.error(`[AuthService] Unexpected error sending OTP: ${err}`);
      return { error: 'An unexpected error occurred.' };
    }
  }

  public async verifyOtp(
    email: string,
    code: string,
  ): Promise<{ error?: string }> {
    try {
      const { data, error } = await this.authClient.signIn.emailOtp({
        email,
        otp: code,
      });

      if (error) {
        this.logger.error(
          `[AuthService] Failed to verify OTP: ${error.message}`,
        );
        return { error: error.message };
      }

      // The global onSuccess handler already persisted the token.
      // Now update auth state with the user info.
      const user = data?.user;
      this.updateAuthState((draft) => {
        draft.userAccount = {
          ...draft.userAccount,
          status: 'authenticated',
          machineId: this.identifierService.getMachineId(),
          user: user ? { id: user.id, email: user.email ?? '' } : undefined,
        };
      });

      const currentToken = this._credentials?.token;
      if (user && currentToken) {
        this.persistCredentials({
          ...this._credentials,
          token: currentToken,
          user: {
            id: user.id,
            email: user.email ?? undefined,
            name: user.name ?? undefined,
          },
        });
      }

      if (currentToken) {
        void this.fetchSubscription(currentToken);
      }

      this.logger.debug('[AuthService] Signed in via OTP');
      return {};
    } catch (err) {
      this.logger.error(`[AuthService] Unexpected error verifying OTP: ${err}`);
      return { error: 'An unexpected error occurred.' };
    }
  }

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  private async refreshSession(): Promise<void> {
    if (!this._credentials?.token) {
      this.updateAuthState((draft) => {
        draft.userAccount = {
          status: 'unauthenticated',
          machineId: this.identifierService.getMachineId(),
        };
      });
      return;
    }

    try {
      const { data, error } = await this.authClient.getSession();

      if (error || !data) {
        this.logger.warn(
          `[AuthService] Session refresh failed: ${error?.message ?? 'no session'} (status: ${error?.status ?? 'unknown'})`,
        );
        // Only treat definitive auth rejections as unauthenticated.
        // 5xx, 429, or any other non-auth HTTP error means the server is
        // temporarily unavailable — keep credentials intact.
        const isAuthRejection = error?.status === 401 || error?.status === 403;
        if (isAuthRejection) {
          this.persistCredentials(null);
          this.updateAuthState((draft) => {
            draft.userAccount = {
              status: 'unauthenticated',
              machineId: this.identifierService.getMachineId(),
            };
          });
        } else {
          this.updateAuthState((draft) => {
            draft.userAccount.status = 'server_unreachable';
          });
        }
        return;
      }

      const user = data.user;
      const credentials = this._credentials;
      if (user && credentials) {
        this.persistCredentials({
          ...credentials,
          user: {
            id: user.id,
            email: user.email ?? undefined,
            name: user.name ?? undefined,
          },
        });
      }

      this.updateAuthState((draft) => {
        draft.userAccount = {
          ...draft.userAccount,
          status: 'authenticated',
          machineId: this.identifierService.getMachineId(),
          user: user
            ? { id: user.id, email: user.email ?? '' }
            : draft.userAccount.user,
        };
      });

      const token = this._credentials?.token;
      if (token) {
        void this.fetchSubscription(token);
      }
    } catch (err) {
      this.logger.error(`[AuthService] Failed to refresh session: ${err}`);
      this.updateAuthState((draft) => {
        draft.userAccount.status = 'server_unreachable';
      });
    }
  }

  private async fetchSubscription(accessToken: string): Promise<void> {
    const subscriptionData =
      await this.serverInterop.getSubscription(accessToken);

    if (subscriptionData) {
      this.updateAuthState((draft) => {
        draft.userAccount = {
          ...draft.userAccount,
          subscription: {
            active:
              subscriptionData.status === 'active' ||
              subscriptionData.status === 'trialing',
            plan: subscriptionData.plan || undefined,
            expiresAt: subscriptionData.currentPeriodEnd || undefined,
          },
        };
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  public async logout(): Promise<void> {
    try {
      await this.authClient.signOut();
    } catch {
      // Sign-out may fail if server is unreachable; we still clear local state.
    }

    this.persistCredentials(null);

    this.updateAuthState((draft) => {
      draft.userAccount = {
        status: 'unauthenticated',
        machineId: this.identifierService.getMachineId(),
      };
    });

    this.notificationService.showNotification({
      title: 'Logged out',
      message: 'You have been logged out of stagewise.',
      type: 'info',
      duration: 5000,
      actions: [],
    });

    this.logger.debug('[AuthService] Logged out');
  }

  public get authState(): AuthState {
    this.assertNotDisposed();
    return this.uiKarton.state.userAccount;
  }

  public get accessToken(): string | undefined {
    this.assertNotDisposed();
    return this._credentials?.token ?? undefined;
  }

  public async refreshAuthState(): Promise<AuthState> {
    await this.refreshSession();
    return this.authState;
  }

  public async getUsageCurrent(): Promise<CurrentUsageResponse> {
    const token = this.accessToken;
    if (!token) throw new Error('Not authenticated');
    return this.serverInterop.getUsageCurrent(token);
  }

  public async getUsageHistory(days?: number): Promise<UsageHistoryResponse> {
    const token = this.accessToken;
    if (!token) throw new Error('Not authenticated');
    return this.serverInterop.getUsageHistory(token, days);
  }

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  private updateAuthState(
    draft: Parameters<typeof this.uiKarton.setState>[0],
  ): void {
    const oldState = structuredClone(this.uiKarton.state.userAccount);
    this.uiKarton.setState(draft);
    const newState = this.uiKarton.state.userAccount;
    if (JSON.stringify(oldState) !== JSON.stringify(newState)) {
      for (const callback of this.authChangeCallbacks) {
        try {
          callback(newState);
        } catch {
          // NO-OP
        }
      }
    }
  }

  public registerAuthStateChangeCallback(
    callback: (newAuthState: AuthState) => void,
  ): void {
    this.authChangeCallbacks.push(callback);
  }

  public unregisterAuthStateChangeCallback(
    callback: (newAuthState: AuthState) => void,
  ): void {
    this.authChangeCallbacks = this.authChangeCallbacks.filter(
      (c) => c !== callback,
    );
  }
}
