import type { KartonContract } from '@stagewise/karton-contract';
import type { GlobalDataPathService } from '../global-data-path';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import { AuthServerInterop, consoleUrl } from './server-interop';
import { AuthTokenStore } from './token-store';
import { stagewiseAppPrefix } from '../ui-server/shared';
import type { NotificationService } from '../notification';
import type { IdentifierService } from '../identifier';

export type AuthState = KartonContract['state']['userAccount'];

const ACCESS_TOKEN_EXPIRATION_BUFFER_TIME = 10 * 60 * 1000; // We refresh the token 10 minutes before it expires to avoid any issues

export class AuthService {
  private globalDataPathService: GlobalDataPathService;
  private identifierService: IdentifierService;
  private kartonService: KartonService;
  private notificationService: NotificationService;
  private logger: Logger;
  private tokenStore!: AuthTokenStore;
  private serverInterop: AuthServerInterop;
  private _authStateCheckInterval: NodeJS.Timeout | null = null;
  private authChangeCallbacks: ((newAuthState: AuthState) => void)[] = [];
  private authenticationConirmationCallback: (() => Promise<void>) | null =
    null;

  private constructor(
    globalDataPathService: GlobalDataPathService,
    identifierService: IdentifierService,
    kartonService: KartonService,
    notificationService: NotificationService,
    logger: Logger,
  ) {
    this.globalDataPathService = globalDataPathService;
    this.identifierService = identifierService;
    this.kartonService = kartonService;
    this.notificationService = notificationService;
    this.logger = logger;
    this.serverInterop = new AuthServerInterop(logger);
  }

  private async initialize(): Promise<void> {
    this.tokenStore = await AuthTokenStore.create(
      this.globalDataPathService,
      this.logger,
    );

    this.kartonService.setState((draft) => {
      draft.userAccount.status = 'server_unreachable';
    });

    // We do the initial auth state asynchronously.
    void this.checkAuthState();
    this._authStateCheckInterval = setInterval(
      () => {
        void this.checkAuthState();
      },
      10 * 60 * 1000,
    ); // 10 minutes

    // Register all procedure handlers for the user account
    this.kartonService.registerServerProcedureHandler(
      'userAccount.logout',
      async () => {
        await this.logout();
      },
    );

    this.kartonService.registerServerProcedureHandler(
      'userAccount.startLogin',
      async () => {
        await this.startLogin();
      },
    );

    this.kartonService.registerServerProcedureHandler(
      'userAccount.abortLogin',
      async () => {
        await this.abortLogin();
      },
    );

    this.kartonService.registerServerProcedureHandler(
      'userAccount.refreshStatus',
      async () => {
        await this.checkAuthState();
      },
    );

    this.kartonService.registerServerProcedureHandler(
      'userAccount.confirmAuthenticationConfirmation',
      async () => {
        await this.confirmAuthenticationConfirmation();
      },
    );

    this.kartonService.registerServerProcedureHandler(
      'userAccount.cancelAuthenticationConfirmation',
      async () => {
        await this.cancelAuthenticationConfirmation();
      },
    );

    // Check if we have any tokens stored in
    this.logger.debug('[AuthService] Initialized');
  }

  public static async create(
    globalDataPathService: GlobalDataPathService,
    identifierService: IdentifierService,
    kartonService: KartonService,
    notificationService: NotificationService,
    logger: Logger,
  ): Promise<AuthService> {
    const authService = new AuthService(
      globalDataPathService,
      identifierService,
      kartonService,
      notificationService,
      logger,
    );
    await authService.initialize();
    return authService;
  }

  public tearDown(): void {
    clearInterval(this._authStateCheckInterval!);

    this.kartonService.removeServerProcedureHandler('userAccount.logout');
    this.kartonService.removeServerProcedureHandler('userAccount.startLogin');
    this.kartonService.removeServerProcedureHandler('userAccount.abortLogin');
    this.kartonService.removeServerProcedureHandler(
      'userAccount.refreshStatus',
    );
    this.kartonService.removeServerProcedureHandler(
      'userAccount.confirmAuthenticationConfirmation',
    );
    this.kartonService.removeServerProcedureHandler(
      'userAccount.cancelAuthenticationConfirmation',
    );
    this.authChangeCallbacks = [];

    this.logger.debug('[AuthService] Teared down auth service');
  }

  // Regularly callable function that checks, if auth if configured and valid.
  // Will be called every 10 minutes by default, but this function can also be call as soon as we think there may be some issue with auth.
  // It updates the karton state with latest information on auth.
  private async checkAuthState(): Promise<void> {
    // Check if we have token data stored
    if (!this.tokenStore.tokenData?.accessToken) {
      // early exit, since there's no token stored anyway
      this.updateAuthState((draft) => {
        draft.userAccount = {
          status: 'unauthenticated',
          loginDialog: null,
          machineId: this.identifierService.getMachineId(),
        };
      });
      return;
    }

    // If yes, we check if the token needs to be refreshed. (look at expiration date)
    if (
      this.tokenStore.tokenData.expiresAt &&
      this.tokenStore.tokenData.expiresAt <
        new Date(Date.now() + ACCESS_TOKEN_EXPIRATION_BUFFER_TIME)
    ) {
      // We check if the refresh token is still valid. If no, we simply logout.
      if (
        this.tokenStore.tokenData.refreshExpiresAt &&
        this.tokenStore.tokenData.refreshExpiresAt < new Date()
      ) {
        await this.logout();
        return;
      }

      const refreshSuccessful = await this.serverInterop
        .refreshToken(this.tokenStore.tokenData.refreshToken)
        .then((tokenData) => {
          this.tokenStore.tokenData = {
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            expiresAt: new Date(tokenData.expiresAt),
            refreshExpiresAt: new Date(tokenData.refreshExpiresAt),
          };
          return true;
        })
        .catch((err) => {
          this.notificationService.showNotification({
            title: 'Failed to refresh authentication token',
            message: 'Please sign in again.',
            type: 'error',
            duration: 5000,
            actions: [],
          });
          this.logger.error(
            `[AuthService] Failed to refresh token. Error: ${err}`,
          );
          void this.logout();
          return false;
        });

      if (!refreshSuccessful) {
        // we can make an early exit here
        return;
      }
    }

    // We fetch the user session data from the server and update the user state if we get valid data.
    await this.serverInterop
      .getSession(this.tokenStore.tokenData.accessToken)
      .then(async (sessionData) => {
        if (!sessionData) {
          this.logger.error(
            `[AuthService] Returned session is empty. Logging out.`,
          );
          void this.logout();
          return;
        }

        if (!sessionData.valid) {
          this.logger.error(
            `[AuthService] Returned session is not valid. Logging out.`,
          );
          void this.logout();
          return;
        }

        this.updateAuthState((draft) => {
          draft.userAccount = {
            ...draft.userAccount,
            status: 'authenticated',
            machineId: this.identifierService.getMachineId(),
          };
        });

        // We also fetch user subscription information from the server.
        const subscriptionData = await this.serverInterop.getSubscription(
          this.tokenStore.tokenData!.accessToken,
        );

        this.updateAuthState((draft) => {
          draft.userAccount = {
            ...draft.userAccount,
            status: 'authenticated',
            machineId: this.identifierService.getMachineId(),
            user: {
              id: sessionData.userId,
              email: sessionData.userEmail,
            },
            subscription: {
              active: subscriptionData?.hasSubscription || false,
              plan: subscriptionData?.subscription?.priceId || undefined,
              expiresAt:
                subscriptionData?.subscription?.currentPeriodEnd?.toISOString() ||
                undefined,
            },
          };
        });
      })
      .catch((err) => {
        this.updateAuthState((draft) => {
          draft.userAccount.status = 'server_unreachable';
        });

        this.logger.error(`[AuthService] Failed to get session: ${err}`);
      });
  }

  public async logout(): Promise<void> {
    if (!this.tokenStore.tokenData?.accessToken) {
      // early exit, since there's no token stored anyway
      return;
    }
    // Clear the stored token data
    await this.serverInterop
      .revokeToken(this.tokenStore.tokenData?.accessToken)
      .catch((err) => {
        this.logger.error(
          `[AuthService] Failed to revoke token on server side. Logging out anyway. Error: ${err}`,
        );
      });
    this.tokenStore.tokenData = null;

    this.notificationService.showNotification({
      title: 'Logged out',
      message: 'You have been logged out of stagewise.',
      type: 'info',
      duration: 5000,
      actions: [],
    });

    void this.checkAuthState();
    this.logger.debug('[AuthService] Logged out');
  }

  public async startLogin(): Promise<void> {
    // If the user is already authenticated, we just early exit
    if (this.authState.status !== 'unauthenticated') {
      return;
    }

    this.updateAuthState((draft) => {
      draft.userAccount = {
        ...draft.userAccount,
        machineId: this.identifierService.getMachineId(),
        loginDialog: {
          startUrl: this.getAuthUrl(),
        },
      };
    });
  }

  public async abortLogin(): Promise<void> {
    this.updateAuthState((draft) => {
      draft.userAccount = {
        ...draft.userAccount,
        loginDialog: null,
      };
    });
  }

  // This function should only be called by the web server that the CLI hosts and that receives the auth code from the user.
  public async handleAuthCodeExchange(
    authCode: string | undefined,
    error: string | undefined,
  ): Promise<void> {
    this.updateAuthState((draft) => {
      draft.userAccount = {
        ...draft.userAccount,
        loginDialog: null,
      };
    });
    if (error) {
      this.logger.error(`[AuthService] Failed to exchange token: ${error}`);
    }
    if (!authCode) {
      this.logger.error(`[AuthService] No auth code provided`);
      return;
    }
    this.updateAuthState((draft) => {
      draft.userAccount = {
        ...draft.userAccount,
        pendingAuthenticationConfirmation: true,
      };
    });
    // This function is executed if the user approves the sign in.
    this.authenticationConirmationCallback = async () => {
      const tokenData = await this.serverInterop.exchangeToken(authCode);
      this.tokenStore.tokenData = {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt: new Date(tokenData.expiresAt),
        refreshExpiresAt: new Date(tokenData.refreshExpiresAt),
      };
    };
  }

  private async confirmAuthenticationConfirmation(): Promise<void> {
    this.logger.debug('[AuthService] User confirmed authentication');
    try {
      await this.authenticationConirmationCallback?.();
      await this.checkAuthState();
    } catch (err) {
      this.logger.error(`[AuthService] Failed to exchange token: ${err}`);
      void this.logout();
    } finally {
      this.updateAuthState((draft) => {
        draft.userAccount = {
          ...draft.userAccount,
          pendingAuthenticationConfirmation: false,
        };
      });
      this.authenticationConirmationCallback = null;
    }
  }

  private async cancelAuthenticationConfirmation(): Promise<void> {
    this.logger.debug('[AuthService] User cancelled authentication');
    this.authenticationConirmationCallback = null;
    this.updateAuthState((draft) => {
      draft.userAccount = {
        ...draft.userAccount,
        pendingAuthenticationConfirmation: false,
      };
    });
  }

  public get authState(): AuthState {
    // We store everything in karton and just report it here. Makes it easier and reduces redundancy...
    return this.kartonService.state.userAccount;
  }

  public get accessToken(): string | undefined {
    return this.tokenStore.tokenData?.accessToken;
  }

  public async refreshAuthState(): Promise<AuthState> {
    await this.checkAuthState();
    return this.authState;
  }

  private getAuthUrl(): string {
    const runningPort = this.kartonService.state.appInfo.runningOnPort;
    const callbackUrl = `http://localhost:${runningPort}${stagewiseAppPrefix}/auth/callback`;

    return `${consoleUrl}/authenticate-ide?ide=cli&redirect_uri=${encodeURIComponent(callbackUrl)}`;
  }

  private updateAuthState(
    draft: Parameters<typeof this.kartonService.setState>[0],
  ): void {
    const oldState = structuredClone(this.kartonService.state.userAccount);
    this.kartonService.setState(draft);
    const newState = this.kartonService.state.userAccount;
    if (JSON.stringify(oldState) !== JSON.stringify(newState)) {
      this.authChangeCallbacks.forEach((callback) => {
        try {
          callback(newState);
        } catch {
          // NO-OP
        }
      });
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
