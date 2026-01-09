import type { KartonContract } from '@shared/karton-contracts/ui';
import type { GlobalDataPathService } from '../global-data-path';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import { AuthServerInterop, consoleUrl } from './server-interop';
import { AuthTokenStore } from './token-store';
import type { NotificationService } from '../notification';
import type { IdentifierService } from '../identifier';
import type { URIHandlerService } from '../uri-handler';
import { shell } from 'electron';
import { DisposableService } from '../disposable';

export type AuthState = KartonContract['state']['userAccount'];

const ACCESS_TOKEN_EXPIRATION_BUFFER_TIME = 10 * 60 * 1000; // We refresh the token 10 minutes before it expires to avoid any issues

export class AuthService extends DisposableService {
  // Borrowed dependencies (passed via constructor)
  private readonly globalDataPathService: GlobalDataPathService;
  private readonly identifierService: IdentifierService;
  private readonly uiKarton: KartonService;
  private readonly notificationService: NotificationService;
  private readonly uriHandlerService: URIHandlerService;
  private readonly logger: Logger;

  // Owned child services (created in initialize)
  private tokenStore!: AuthTokenStore;
  private serverInterop: AuthServerInterop;

  private _authStateCheckInterval: NodeJS.Timeout | null = null;
  private authChangeCallbacks: ((newAuthState: AuthState) => void)[] = [];
  private authenticationConfirmationCallback: (() => Promise<void>) | null =
    null;

  private _uriHandlerId: string | null = null;

  private constructor(
    globalDataPathService: GlobalDataPathService,
    identifierService: IdentifierService,
    uiKarton: KartonService,
    notificationService: NotificationService,
    uriHandlerService: URIHandlerService,
    logger: Logger,
  ) {
    super();
    this.globalDataPathService = globalDataPathService;
    this.identifierService = identifierService;
    this.uiKarton = uiKarton;
    this.notificationService = notificationService;
    this.uriHandlerService = uriHandlerService;
    this.logger = logger;
    this.serverInterop = new AuthServerInterop(logger);
  }

  private async initialize(): Promise<void> {
    this.tokenStore = await AuthTokenStore.create(
      this.globalDataPathService,
      this.logger,
    );

    this.uiKarton.setState((draft) => {
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
    this.uiKarton.registerServerProcedureHandler(
      'userAccount.logout',
      async (_callingClientId: string) => {
        await this.logout();
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'userAccount.startLogin',
      async (_callingClientId: string) => {
        await this.startLogin();
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'userAccount.refreshStatus',
      async (_callingClientId: string) => {
        await this.checkAuthState();
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'userAccount.confirmAuthenticationConfirmation',
      async (_callingClientId: string) => {
        await this.confirmAuthenticationConfirmation();
      },
    );

    this.uiKarton.registerServerProcedureHandler(
      'userAccount.cancelAuthenticationConfirmation',
      async (_callingClientId: string) => {
        await this.cancelAuthenticationConfirmation();
      },
    );

    this._uriHandlerId = this.uriHandlerService.registerHandler(
      'auth',
      this.handleAuthURI,
    );

    // Check if we have any tokens stored in
    this.logger.debug('[AuthService] Initialized');
  }

  public static async create(
    globalDataPathService: GlobalDataPathService,
    identifierService: IdentifierService,
    uiKarton: KartonService,
    notificationService: NotificationService,
    uriHandlerService: URIHandlerService,
    logger: Logger,
  ): Promise<AuthService> {
    const authService = new AuthService(
      globalDataPathService,
      identifierService,
      uiKarton,
      notificationService,
      uriHandlerService,
      logger,
    );
    await authService.initialize();
    return authService;
  }

  protected onTeardown(): void {
    clearInterval(this._authStateCheckInterval!);

    this.uiKarton.removeServerProcedureHandler('userAccount.logout');
    this.uiKarton.removeServerProcedureHandler('userAccount.startLogin');
    this.uiKarton.removeServerProcedureHandler('userAccount.refreshStatus');
    this.uiKarton.removeServerProcedureHandler(
      'userAccount.confirmAuthenticationConfirmation',
    );
    this.uiKarton.removeServerProcedureHandler(
      'userAccount.cancelAuthenticationConfirmation',
    );
    this.authChangeCallbacks = [];

    if (this._uriHandlerId) {
      this.uriHandlerService.unregisterHandler(this._uriHandlerId);
    }

    this.logger.debug('[AuthService] Teardown complete');
  }

  private handleAuthURI: (uri: string) => Promise<void> = (async (
    uri: string,
  ) => {
    const path = uri.split('?')[0];
    const searchParams = new URLSearchParams(uri.split('?')[1]);

    if (path === 'auth/callback') {
      const authCode = searchParams.get('authCode');
      const error = searchParams.get('error');

      void this.handleAuthCodeExchange(
        authCode ?? undefined,
        error ?? undefined,
      );
    }
  }).bind(this);

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
          // We log out, if the error is anything else other than an internal server error or the server is unreachable.
          if (
            !err.message.toLowerCase().includes('internal server error') &&
            !err.message.toLowerCase().includes('unreachable') &&
            err.code !== 'ECONNREFUSED' &&
            err.code !== 'ECONNRESET' &&
            !err.message.toLowerCase().includes('fetch failed')
          ) {
            void this.logout();
          }
          return true;
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

    const authUrl = this.getAuthUrl();
    shell.openExternal(authUrl);

    this.updateAuthState((draft) => {
      draft.userAccount = {
        ...draft.userAccount,
        machineId: this.identifierService.getMachineId(),
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
    this.authenticationConfirmationCallback = async () => {
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
      await this.authenticationConfirmationCallback?.();
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
      this.authenticationConfirmationCallback = null;
    }
  }

  private async cancelAuthenticationConfirmation(): Promise<void> {
    this.logger.debug('[AuthService] User cancelled authentication');
    this.authenticationConfirmationCallback = null;
    this.updateAuthState((draft) => {
      draft.userAccount = {
        ...draft.userAccount,
        pendingAuthenticationConfirmation: false,
      };
    });
  }

  public get authState(): AuthState {
    this.assertNotDisposed();
    // We store everything in karton and just report it here. Makes it easier and reduces redundancy...
    return this.uiKarton.state.userAccount;
  }

  public get accessToken(): string | undefined {
    this.assertNotDisposed();
    return this.tokenStore.tokenData?.accessToken;
  }

  public async refreshAuthState(): Promise<AuthState> {
    await this.checkAuthState();
    return this.authState;
  }

  private getAuthUrl(): string {
    const callbackUrl = `stagewise://auth/callback`;

    return `${consoleUrl}/authenticate-ide?ide=cli&redirect_uri=${encodeURIComponent(callbackUrl)}&no-cookie-banner=true`;
  }

  private updateAuthState(
    draft: Parameters<typeof this.uiKarton.setState>[0],
  ): void {
    const oldState = structuredClone(this.uiKarton.state.userAccount);
    this.uiKarton.setState(draft);
    const newState = this.uiKarton.state.userAccount;
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
