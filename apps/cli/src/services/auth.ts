import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createNodeApiClient } from '@stagewise/api-client';
import type { Logger } from './logger';
import type { GlobalDataPathService } from './global-data-path';
import type { IdentifierService } from './identifier';
import type { KartonService } from './karton';
import type { NotificationService } from './notification';
import type { KartonContract } from '@stagewise/karton-contract';
import { stagewiseAppPrefix } from './ui-server/shared';

// Configuration
const STAGEWISE_CONSOLE_URL =
  process.env.STAGEWISE_CONSOLE_URL || 'https://console.stagewise.io';

const API_URL = process.env.API_URL || 'https://v1.api.stagewise.io';

const CREDENTIALS_FILENAME = 'credentials.json';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // Access token expiry (1 hour)
  refreshExpiresAt: string; // Refresh token expiry (30 days)
}

interface SessionValidationResponse {
  valid: boolean;
  userId: string;
  userEmail: string;
  extensionId: string;
  createdAt: string;
  isExpiringSoon: boolean;
}

export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  refreshExpiresAt?: string;
  userId?: string;
  userEmail?: string;
}

type AuthState = KartonContract['state']['userAccount'];

/**
 * AuthService
 *
 * Unified authentication service exposing OAuth flow and token management.
 * Checks credentials validity on creation and provides simple state management.
 */
export class AuthService {
  private refreshPromise: Promise<void> | null = null;
  private cachedAccessToken: string | null = null;
  private cachedRefreshToken: string | null = null;
  private readonly logger: Logger;
  private readonly globalDataPathService: GlobalDataPathService;
  private readonly identifierService: IdentifierService;
  private readonly credentialsFilePath: string;
  private currentAuthState: AuthState;
  private kartonService: KartonService;
  private notificationService: NotificationService;

  private constructor(
    globalDataPathService: GlobalDataPathService,
    identifierService: IdentifierService,
    logger: Logger,
    kartonService: KartonService,
    notificationService: NotificationService,
  ) {
    this.globalDataPathService = globalDataPathService;
    this.logger = logger;
    this.identifierService = identifierService;
    this.credentialsFilePath = path.join(
      this.globalDataPathService.globalDataPath,
      CREDENTIALS_FILENAME,
    );
    this.currentAuthState = {
      status: 'unauthenticated',
      loginDialog: null,
      machineId: this.identifierService.getMachineId(),
    };
    this.kartonService = kartonService;
    this.notificationService = notificationService;
  }

  private async initializeAsync(): Promise<void> {
    try {
      // Register all karton procedure handlers
      this.kartonService.registerServerProcedureHandler(
        'userAccount.startLogin',
        async () => {
          await this.openLoginDialog();
        },
      );
      this.kartonService.registerServerProcedureHandler(
        'userAccount.abortLogin',
        async () => {
          await this.abortLogin();
        },
      );

      this.kartonService.registerServerProcedureHandler(
        'userAccount.logout',
        async () => {
          await this.logout();
        },
      );

      // Check if credentials file exists
      const storedToken = await this.getStoredToken();

      if (!storedToken?.accessToken) {
        this.currentAuthState = {
          status: 'unauthenticated',
          loginDialog: null,
          machineId: this.identifierService.getMachineId(),
        };
        this.kartonService.setState((draft) => {
          draft.userAccount = this.currentAuthState;
        });

        // TODO: Redirect this to the experience service instead of always triggering it
        this.notificationService.showNotification({
          title: 'Unleash stagewise superpowers',
          message:
            "Sign in to get access to all features of stagewise. It's free!",
          type: 'info',
          duration: 6000,
          actions: [
            {
              label: 'Sign in',
              type: 'primary',
              onClick: () => {
                void this.openLoginDialog();
              },
            },
          ],
        });

        return;
      }

      // Check if refresh token is expired
      if (
        storedToken.refreshExpiresAt &&
        new Date(storedToken.refreshExpiresAt) <= new Date()
      ) {
        // Refresh token is expired, clear credentials
        await this.clearToken();
        this.currentAuthState = {
          status: 'authentication_invalid',
          loginDialog: null,
          machineId: this.identifierService.getMachineId(),
        };
        this.kartonService.setState((draft) => {
          draft.userAccount = this.currentAuthState;
        });
        this.notificationService.showNotification({
          title: 'Authentication data invalid',
          message: 'The refresh token has expired. Please sign in again.',
          type: 'error',
          duration: 20000, // 20 seconds
          actions: [
            {
              label: 'Sign in again',
              type: 'primary',
              onClick: () => {
                void this.openLoginDialog();
              },
            },
          ],
        });
        return;
      }

      // Check if access token needs refresh
      if (
        storedToken.expiresAt &&
        this.isAccessTokenExpired(storedToken.expiresAt)
      ) {
        try {
          await this.refreshTokens();
          // Re-fetch the updated token after refresh
          const updatedToken = await this.getStoredToken();
          if (updatedToken) {
            await this.updateAuthStateFromToken(updatedToken);
          }
        } catch (_error) {
          this.logger.warn('Failed to refresh token during initialization');
          this.currentAuthState = {
            status: 'authentication_invalid',
            loginDialog: null,
            machineId: this.identifierService.getMachineId(),
          };
          this.kartonService.setState((draft) => {
            draft.userAccount = this.currentAuthState;
          });
          this.notificationService.showNotification({
            title: 'Authentication data invalid',
            message: 'Failed to validate the stored authentication data.',
            type: 'error',
            duration: 20000, // 20 seconds
            actions: [
              {
                label: 'Sign in again',
                type: 'primary',
                onClick: () => {
                  void this.openLoginDialog();
                },
              },
            ],
          });
          return;
        }
      } else {
        // Validate the current token with the server
        try {
          const sessionData = await this.validateTokenWithServer(
            storedToken.accessToken,
          );
          if (sessionData?.valid) {
            await this.updateAuthStateFromSession(storedToken, sessionData);
            // Try to fetch subscription info
            await this.updateSubscriptionInfo(storedToken.accessToken);
          } else {
            this.currentAuthState = {
              machineId: this.identifierService.getMachineId(),
              status: 'authentication_invalid',
              loginDialog: null,
            };
            this.kartonService.setState((draft) => {
              draft.userAccount = this.currentAuthState;
            });
            this.notificationService.showNotification({
              title: 'Authentication data invalid',
              message: 'Failed to validate the stored authentication data.',
              type: 'error',
              duration: 20000, // 20 seconds
              actions: [
                {
                  label: 'Sign in again',
                  type: 'primary',
                  onClick: () => {
                    void this.openLoginDialog();
                  },
                },
              ],
            });
          }
        } catch (_error) {
          // Server is not reachable
          this.currentAuthState = {
            machineId: this.identifierService.getMachineId(),
            loginDialog: null,
            status: 'server_unreachable',
            user:
              storedToken.userId && storedToken.userEmail
                ? {
                    id: storedToken.userId,
                    email: storedToken.userEmail,
                  }
                : undefined,
            tokenExpiresAt: storedToken.expiresAt,
            refreshTokenExpiresAt: storedToken.refreshExpiresAt,
          };
          this.kartonService.setState((draft) => {
            draft.userAccount = this.currentAuthState;
          });
          this.notificationService.showNotification({
            title: 'Service not reachable',
            message:
              'Seems like the stagewise authentication service is not reachable.',
            type: 'error',
            duration: 20000, // 20 seconds
            actions: [
              {
                label: 'Try again',
                type: 'primary',
                onClick: () => {
                  this.doRefreshAuthData();
                },
              },
            ],
          });
        }
      }

      // Cache tokens if valid
      if (this.currentAuthState.status === 'authenticated') {
        this.cachedAccessToken = storedToken.accessToken;
        this.cachedRefreshToken = storedToken.refreshToken || null;
      }
    } catch (error) {
      this.logger.error(`Failed to initialize auth service: ${error}`);
      this.currentAuthState = {
        machineId: this.identifierService.getMachineId(),
        status: 'unauthenticated',
        loginDialog: null,
      };
      this.kartonService.setState((draft) => {
        draft.userAccount = this.currentAuthState;
      });
      this.notificationService.showNotification({
        title: 'Authentication service error',
        message: 'Failed to initialize authentication service.',
        type: 'error',
        duration: 20000, // 20 seconds
        actions: [
          {
            label: 'Try again',
            type: 'primary',
            onClick: () => {
              void this.initializeAsync();
            },
          },
        ],
      });
    }
  }

  public static create(
    globalDataPathService: GlobalDataPathService,
    identifierService: IdentifierService,
    logger: Logger,
    kartonService: KartonService,
    notificationService: NotificationService,
  ): AuthService {
    logger.debug('[AuthService] Creating service...');
    const instance = new AuthService(
      globalDataPathService,
      identifierService,
      logger,
      kartonService,
      notificationService,
    );
    // Initialize asynchronously - don't block service creation
    instance.initializeAsync();
    logger.debug(
      '[AuthService] Service created, authentication check in progress',
    );
    return instance;
  }

  /**
   * Get the current authentication state
   */
  public getAuthState(): AuthState {
    return { ...this.currentAuthState };
  }

  /**
   * Get the authentication URL for OAuth flow
   */
  public getAuthUrl(callbackUrl: string): string {
    return `${STAGEWISE_CONSOLE_URL}/authenticate-ide?ide=cli&redirect_uri=${encodeURIComponent(callbackUrl)}`;
  }

  public async handleAuthCallback(
    authCode?: string,
    error?: string,
  ): Promise<void> {
    this.logger.debug(`[AuthService] Handling auth callback...`);

    this.currentAuthState = {
      ...this.currentAuthState,
      loginDialog: null,
    };
    this.kartonService.setState((draft) => {
      draft.userAccount = this.currentAuthState;
    });

    if (error) {
      await this.clearToken();
      this.cachedAccessToken = null;
      this.cachedRefreshToken = null;
      this.notificationService.showNotification({
        title: 'Authentication failed',
        message: error,
        type: 'error',
        duration: 20000, // 20 seconds
        actions: [],
      });
      return;
    }

    if (!authCode) {
      this.notificationService.showNotification({
        title: 'Authentication failed',
        message: 'No auth code provided',
        type: 'error',
        duration: 20000, // 20 seconds
        actions: [],
      });
      return;
    }

    await new Promise((resolve, reject) => {
      this.notificationService.showNotification({
        title: 'New user authentication',
        message: 'Please confirm that you just signed up into stagewise.',
        type: 'info',
        actions: [
          {
            label: 'Confirm',
            onClick: () => {
              resolve(true);
            },
            type: 'primary',
          },
          {
            label: 'Cancel',
            onClick: () => {
              reject(new Error('Authentication cancelled'));
            },
            type: 'secondary',
          },
        ],
      });
    });

    await this.storeAuthToken(authCode as string)
      .then(() => {
        this.notificationService.showNotification({
          title: 'Authentication successful',
          message: 'You are now authenticated',
          type: 'info',
          duration: 6000,
          actions: [],
        });
      })
      .catch((error) => {
        this.notificationService.showNotification({
          title: 'Authentication failed',
          message: error.message,
          type: 'error',
          duration: 6000,
          actions: [],
        });
      });
  }

  /**
   * Store and validate an auth token received from OAuth callback
   */
  public async storeAuthToken(authCode: string): Promise<void> {
    try {
      // Exchange auth code for tokens
      const response = await axios.post(
        `${STAGEWISE_CONSOLE_URL}/auth/extension/exchange`,
        { authCode },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      if (response.status !== 200) {
        throw new Error(response.data.error || 'Failed to exchange auth code');
      }

      const tokenPair: TokenPair = response.data;

      // Validate session to get user info
      const sessionData = await this.validateTokenWithServer(
        tokenPair.accessToken,
      );

      if (!sessionData?.valid) {
        throw new Error('Token validation failed');
      }

      const tokenData: TokenData = {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresAt: tokenPair.expiresAt,
        refreshExpiresAt: tokenPair.refreshExpiresAt,
        userId: sessionData.userId,
        userEmail: sessionData.userEmail,
      };

      // Store tokens
      await this.storeToken(tokenData);

      // Update cached tokens
      this.cachedAccessToken = tokenPair.accessToken;
      this.cachedRefreshToken = tokenPair.refreshToken;

      // Update auth state
      await this.updateAuthStateFromSession(tokenData, sessionData);

      // Try to fetch subscription info
      await this.updateSubscriptionInfo(tokenPair.accessToken);

      this.logger.debug(
        `Successfully authenticated as: ${sessionData.userEmail}`,
      );
    } catch (error) {
      // Clear any partially stored data
      await this.clearToken();
      this.cachedAccessToken = null;
      this.cachedRefreshToken = null;
      this.currentAuthState = {
        machineId: this.identifierService.getMachineId(),
        status: 'unauthenticated',
        loginDialog: null,
      };
      this.kartonService.setState((draft) => {
        draft.userAccount = this.currentAuthState;
      });

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 400) {
          throw new Error('Invalid or expired auth code');
        } else if (error.response?.status === 500) {
          throw new Error(
            'Authentication service error - please try again later',
          );
        } else if (error.code === 'ECONNABORTED') {
          throw new Error(
            'Connection timeout - please check your internet connection',
          );
        } else if (error.response?.data?.error) {
          throw new Error(error.response.data.error);
        }
      }

      throw new Error('Authentication failed - please try again later');
    }
  }

  /**
   * Refresh authentication and subscription data
   */
  public async refreshAuthData(): Promise<void> {
    // Prevent multiple simultaneous refreshes
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    this.refreshPromise = this.doRefreshAuthData();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefreshAuthData(): Promise<void> {
    const storedToken = await this.getStoredToken();

    if (!storedToken?.accessToken) {
      this.currentAuthState = {
        machineId: this.identifierService.getMachineId(),
        status: 'unauthenticated',
        loginDialog: null,
      };
      this.kartonService.setState((draft) => {
        draft.userAccount = this.currentAuthState;
      });
      return;
    }

    try {
      // Check if we need to refresh the access token
      if (
        storedToken.expiresAt &&
        this.isAccessTokenExpired(storedToken.expiresAt)
      ) {
        await this.refreshTokens();
        // Re-fetch the updated token
        const updatedToken = await this.getStoredToken();
        if (!updatedToken) {
          this.currentAuthState = {
            machineId: this.identifierService.getMachineId(),
            status: 'authentication_invalid',
            loginDialog: null,
          };
          this.kartonService.setState((draft) => {
            draft.userAccount = this.currentAuthState;
          });
          return;
        }
        storedToken.accessToken = updatedToken.accessToken;
      }

      // Validate current session
      const sessionData = await this.validateTokenWithServer(
        storedToken.accessToken,
      );

      if (!sessionData?.valid) {
        this.currentAuthState = {
          machineId: this.identifierService.getMachineId(),
          status: 'authentication_invalid',
          loginDialog: null,
        };
        this.kartonService.setState((draft) => {
          draft.userAccount = this.currentAuthState;
        });
        await this.clearToken();
        return;
      }

      // Update auth state with fresh data
      await this.updateAuthStateFromSession(storedToken, sessionData);

      // Update subscription info
      await this.updateSubscriptionInfo(storedToken.accessToken);
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        // Server unreachable
        this.currentAuthState = {
          ...this.currentAuthState,
          status: 'server_unreachable',
        };
        this.kartonService.setState((draft) => {
          draft.userAccount = this.currentAuthState;
        });
      } else if (
        error instanceof Error &&
        (error.message.includes('authenticate again') ||
          error.message.includes('Refresh token'))
      ) {
        this.currentAuthState = {
          machineId: this.identifierService.getMachineId(),
          status: 'authentication_invalid',
          loginDialog: null,
        };
        this.kartonService.setState((draft) => {
          draft.userAccount = this.currentAuthState;
        });
      } else {
        // Other errors - keep existing state but mark as potentially unreachable
        this.currentAuthState = {
          ...this.currentAuthState,
          status: 'server_unreachable',
        };
        this.kartonService.setState((draft) => {
          draft.userAccount = this.currentAuthState;
        });
      }
    }
  }

  /**
   * Ensure we have a valid access token, refreshing if necessary
   */
  public async ensureValidAccessToken(): Promise<string> {
    const storedToken = await this.getStoredToken();

    if (!storedToken?.accessToken) {
      throw new Error('Not authenticated');
    }

    // Check if access token is expired or expiring soon
    if (
      storedToken.expiresAt &&
      this.isAccessTokenExpired(storedToken.expiresAt)
    ) {
      await this.refreshTokens();

      const updatedToken = await this.getStoredToken();
      if (!updatedToken?.accessToken) {
        throw new Error('Failed to refresh access token');
      }
      return updatedToken.accessToken;
    }

    return storedToken.accessToken;
  }

  /**
   * Logout from stagewise
   */
  public async logout(): Promise<void> {
    const storedToken = await this.getStoredToken();

    // Try to revoke tokens on server side first
    if (storedToken?.refreshToken || storedToken?.accessToken) {
      try {
        await this.revokeToken(
          storedToken.accessToken,
          storedToken.refreshToken,
        );
      } catch (error) {
        // Don't fail logout if revoke fails (network issues, etc.)
        this.logger.warn(
          `Failed to revoke tokens on server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    // Clear stored authentication
    await this.clearToken();

    // Clear cached tokens
    this.cachedAccessToken = null;
    this.cachedRefreshToken = null;

    // Reset auth state
    this.currentAuthState = {
      machineId: this.identifierService.getMachineId(),
      status: 'unauthenticated',
      loginDialog: null,
    };
    this.kartonService.setState((draft) => {
      draft.userAccount = this.currentAuthState;
    });
  }

  /**
   * Get the currently saved access token immediately (without refresh)
   */
  public async getToken(): Promise<{
    accessToken: string;
    refreshToken: string;
  } | null> {
    // Return cached token if available
    if (this.cachedAccessToken && this.cachedRefreshToken) {
      return {
        accessToken: this.cachedAccessToken,
        refreshToken: this.cachedRefreshToken,
      };
    }

    // Load from storage for the first time and cache it
    const storedToken = await this.getStoredToken();
    if (storedToken?.accessToken && storedToken.refreshToken) {
      this.cachedAccessToken = storedToken.accessToken;
      this.cachedRefreshToken = storedToken.refreshToken;
      return {
        accessToken: storedToken.accessToken,
        refreshToken: storedToken.refreshToken,
      };
    }

    return null;
  }

  /**
   * Check if user is authenticated
   */
  public async isAuthenticated(): Promise<boolean> {
    return this.currentAuthState.status === 'authenticated';
  }

  /**
   * Check if the authenticated user has a subscription
   */
  public async getSubscription() {
    const storedToken = await this.getStoredToken();
    if (!storedToken?.accessToken) {
      throw new Error('No access token found');
    }

    const client = createNodeApiClient({
      baseUrl: API_URL,
      headers: {
        Authorization: `Bearer ${storedToken.accessToken}`,
      },
    });
    const subscription = await client.subscription.getSubscription.query();
    return subscription;
  }

  // Private helper methods

  private async validateTokenWithServer(
    accessToken: string,
  ): Promise<SessionValidationResponse | null> {
    // Allow test tokens in test environment
    if (process.env.NODE_ENV === 'test' && accessToken === 'test-token') {
      return {
        valid: true,
        userId: 'test-user',
        userEmail: 'test@example.com',
        extensionId: 'test-ext',
        createdAt: new Date().toISOString(),
        isExpiringSoon: false,
      };
    }

    const response = await axios.get(
      `${STAGEWISE_CONSOLE_URL}/auth/extension/session`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 30000,
      },
    );

    if (response.status === 200) {
      return response.data as SessionValidationResponse;
    }

    return null;
  }

  private async updateAuthStateFromSession(
    tokenData: TokenData,
    sessionData: SessionValidationResponse,
  ): Promise<void> {
    this.currentAuthState = {
      machineId: this.identifierService.getMachineId(),
      loginDialog: null,
      status: 'authenticated',
      user: {
        id: sessionData.userId,
        email: sessionData.userEmail,
      },
      tokenExpiresAt: tokenData.expiresAt,
      refreshTokenExpiresAt: tokenData.refreshExpiresAt,
    };
    this.kartonService.setState((draft) => {
      draft.userAccount = this.currentAuthState;
    });
  }

  private async updateAuthStateFromToken(tokenData: TokenData): Promise<void> {
    if (tokenData.userId && tokenData.userEmail) {
      this.currentAuthState = {
        machineId: this.identifierService.getMachineId(),
        loginDialog: null,
        status: 'authenticated',
        user: {
          id: tokenData.userId,
          email: tokenData.userEmail,
        },
        tokenExpiresAt: tokenData.expiresAt,
        refreshTokenExpiresAt: tokenData.refreshExpiresAt,
      };
      this.kartonService.setState((draft) => {
        draft.userAccount = this.currentAuthState;
      });
    }
  }

  private async updateSubscriptionInfo(accessToken: string): Promise<void> {
    try {
      const client = createNodeApiClient({
        baseUrl: API_URL,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const subscriptionData =
        await client.subscription.getSubscription.query();

      if (subscriptionData?.subscription) {
        this.currentAuthState = {
          ...this.currentAuthState,
          subscription: {
            active:
              subscriptionData.hasSubscription &&
              subscriptionData.subscription.status === 'active',
            plan: subscriptionData.subscription.priceId || undefined,
            expiresAt:
              subscriptionData.subscription.currentPeriodEnd?.toISOString() ||
              undefined,
          },
        };
        this.kartonService.setState((draft) => {
          draft.userAccount = this.currentAuthState;
        });
      }
    } catch (_error) {
      // Don't fail auth if subscription fetch fails
      this.logger.debug('Failed to fetch subscription info');
    }
  }

  private isAccessTokenExpired(expiresAt: string): boolean {
    const expiryTime = new Date(expiresAt);
    const now = new Date();
    // Consider token expired if it expires within 2 minutes (buffer)
    const bufferTime = 2 * 60 * 1000; // 2 minutes in milliseconds
    return expiryTime.getTime() - now.getTime() <= bufferTime;
  }

  /**
   * Compute the redirect callback URL for the OAuth flow based on the running UI server port.
   */
  private getRedirectCallbackUrl(): string {
    const runningPort = this.kartonService.state.appInfo.runningOnPort;
    return `http://localhost:${runningPort}${stagewiseAppPrefix}/auth/callback`;
  }

  /**
   * Open the login dialog by fetching the start URL and setting it into state.
   */
  private async openLoginDialog(): Promise<void> {
    const callbackUrl = this.getRedirectCallbackUrl();
    const startUrl = this.getAuthUrl(callbackUrl);

    this.currentAuthState = {
      ...this.currentAuthState,
      loginDialog: {
        startUrl,
      },
    };

    this.kartonService.setState((draft) => {
      draft.userAccount = this.currentAuthState;
    });
  }

  private async abortLogin(): Promise<void> {
    this.currentAuthState = {
      ...this.currentAuthState,
      loginDialog: null,
    };
    this.kartonService.setState((draft) => {
      draft.userAccount = this.currentAuthState;
    });
  }

  private async refreshTokens(): Promise<void> {
    const storedToken = await this.getStoredToken();

    if (!storedToken?.refreshToken) {
      throw new Error('No refresh token available');
    }

    // Check if refresh token is expired
    if (
      storedToken.refreshExpiresAt &&
      new Date(storedToken.refreshExpiresAt) <= new Date()
    ) {
      // Refresh token is expired, user needs to re-authenticate
      await this.logout();
      throw new Error('Refresh token expired. Please authenticate again.');
    }

    try {
      const response = await axios.post(
        `${STAGEWISE_CONSOLE_URL}/auth/extension/refresh`,
        { refreshToken: storedToken.refreshToken },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      if (response.status !== 200) {
        throw new Error(response.data.error || 'Failed to refresh tokens');
      }

      const tokenPair: TokenPair = response.data;

      // Validate session
      const sessionData = await this.validateTokenWithServer(
        tokenPair.accessToken,
      );

      if (!sessionData?.valid) {
        throw new Error('Failed to validate refreshed token');
      }

      const tokenData: TokenData = {
        ...storedToken,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresAt: tokenPair.expiresAt,
        refreshExpiresAt: tokenPair.refreshExpiresAt,
        userId: sessionData.userId,
        userEmail: sessionData.userEmail,
      };

      // Update cached tokens
      this.cachedAccessToken = tokenPair.accessToken;
      this.cachedRefreshToken = tokenPair.refreshToken;

      // Update stored tokens
      await this.storeToken(tokenData);

      // Update auth state
      await this.updateAuthStateFromSession(tokenData, sessionData);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 400) {
          throw new Error('Refresh token is required');
        } else if (error.response?.status === 401) {
          // Refresh token is invalid, user needs to re-authenticate
          await this.logout();
          const errorMessage =
            error.response?.data?.error || 'Invalid refresh token';
          throw new Error(`${errorMessage}. Please authenticate again.`);
        } else if (error.response?.status === 500) {
          throw new Error('Failed to refresh tokens');
        } else if (error.response?.data?.error) {
          throw new Error(error.response.data.error);
        }
      }
      throw error;
    }
  }

  private async revokeToken(
    token?: string,
    refreshToken?: string,
  ): Promise<void> {
    if (!token && !refreshToken) {
      return;
    }

    const body = refreshToken ? { refreshToken } : { token };

    await axios.post(`${STAGEWISE_CONSOLE_URL}/auth/extension/revoke`, body, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  private async getStoredToken(): Promise<TokenData | null> {
    try {
      const file = await fs.readFile(this.credentialsFilePath, 'utf-8');
      return JSON.parse(file) as TokenData;
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return null;
      }
      this.logger.debug(`Failed to retrieve stored token: ${error}`);
      return null;
    }
  }

  private async storeToken(tokenData: TokenData): Promise<void> {
    try {
      await fs.writeFile(
        this.credentialsFilePath,
        JSON.stringify(tokenData, null, 2),
        'utf-8',
      );
      this.logger.debug('[AuthService] Token stored successfully');
    } catch (error) {
      this.logger.error(`[AuthService] Failed to store token: ${error}`);
      throw error as Error;
    }
  }

  private async clearToken(): Promise<void> {
    try {
      await fs.rm(this.credentialsFilePath, { force: true });
      this.logger.debug('[AuthService] Token deleted successfully');
    } catch (error) {
      this.logger.error(`[AuthService] Failed to delete token: ${error}`);
      throw error as Error;
    }
  }
}
