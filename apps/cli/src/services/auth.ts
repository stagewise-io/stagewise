import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createNodeApiClient } from '@stagewise/api-client';
import type { Logger } from './logger';
import type { GlobalDataPathService } from './global-data-path';

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

export type AuthStatus =
  | 'authenticated'
  | 'unauthenticated'
  | 'authentication_invalid'
  | 'server_unreachable';

export interface AuthState {
  status: AuthStatus;
  user?: {
    id: string;
    email: string;
  };
  subscription?: {
    active: boolean;
    plan?: string;
    expiresAt?: string;
  };
  tokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
}

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
  private readonly credentialsFilePath: string;
  private currentAuthState: AuthState;

  private constructor(
    globalDataPathService: GlobalDataPathService,
    logger: Logger,
  ) {
    this.globalDataPathService = globalDataPathService;
    this.logger = logger;
    this.credentialsFilePath = path.join(
      this.globalDataPathService.globalDataPath,
      CREDENTIALS_FILENAME,
    );
    this.currentAuthState = { status: 'unauthenticated' };
  }

  private async initialize(): Promise<void> {
    try {
      // Check if credentials file exists
      const storedToken = await this.getStoredToken();

      if (!storedToken?.accessToken) {
        this.currentAuthState = { status: 'unauthenticated' };
        return;
      }

      // Check if refresh token is expired
      if (
        storedToken.refreshExpiresAt &&
        new Date(storedToken.refreshExpiresAt) <= new Date()
      ) {
        // Refresh token is expired, clear credentials
        await this.clearToken();
        this.currentAuthState = { status: 'authentication_invalid' };
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
          this.currentAuthState = { status: 'authentication_invalid' };
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
            this.currentAuthState = { status: 'authentication_invalid' };
          }
        } catch (_error) {
          // Server is not reachable
          this.currentAuthState = {
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
        }
      }

      // Cache tokens if valid
      if (this.currentAuthState.status === 'authenticated') {
        this.cachedAccessToken = storedToken.accessToken;
        this.cachedRefreshToken = storedToken.refreshToken || null;
      }
    } catch (error) {
      this.logger.error(`Failed to initialize auth service: ${error}`);
      this.currentAuthState = { status: 'unauthenticated' };
    }
  }

  public static async create(
    globalDataPathService: GlobalDataPathService,
    logger: Logger,
  ): Promise<AuthService> {
    const instance = new AuthService(globalDataPathService, logger);
    await instance.initialize();
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
      this.currentAuthState = { status: 'unauthenticated' };

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
      this.currentAuthState = { status: 'unauthenticated' };
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
          this.currentAuthState = { status: 'authentication_invalid' };
          return;
        }
        storedToken.accessToken = updatedToken.accessToken;
      }

      // Validate current session
      const sessionData = await this.validateTokenWithServer(
        storedToken.accessToken,
      );

      if (!sessionData?.valid) {
        this.currentAuthState = { status: 'authentication_invalid' };
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
      } else if (
        error instanceof Error &&
        (error.message.includes('authenticate again') ||
          error.message.includes('Refresh token'))
      ) {
        this.currentAuthState = { status: 'authentication_invalid' };
      } else {
        // Other errors - keep existing state but mark as potentially unreachable
        this.currentAuthState = {
          ...this.currentAuthState,
          status: 'server_unreachable',
        };
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
    this.currentAuthState = { status: 'unauthenticated' };
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
      status: 'authenticated',
      user: {
        id: sessionData.userId,
        email: sessionData.userEmail,
      },
      tokenExpiresAt: tokenData.expiresAt,
      refreshTokenExpiresAt: tokenData.refreshExpiresAt,
    };
  }

  private async updateAuthStateFromToken(tokenData: TokenData): Promise<void> {
    if (tokenData.userId && tokenData.userEmail) {
      this.currentAuthState = {
        status: 'authenticated',
        user: {
          id: tokenData.userId,
          email: tokenData.userEmail,
        },
        tokenExpiresAt: tokenData.expiresAt,
        refreshTokenExpiresAt: tokenData.refreshExpiresAt,
      };
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

  // Legacy methods for backward compatibility

  /**
   * @deprecated Use getAuthUrl and OAuth callback server instead
   */
  public async initiateOAuthFlow(
    _port: number,
    _successRedirectUrl?: string,
  ): Promise<TokenData> {
    throw new Error(
      'initiateOAuthFlow is deprecated. Use getAuthUrl() and storeAuthToken() instead.',
    );
  }

  /**
   * @deprecated Use checkAuthStatus or getAuthState instead
   */
  public async checkAuthStatus(): Promise<any> {
    const state = this.getAuthState();
    return {
      isAuthenticated: state.status === 'authenticated',
      userId: state.user?.id,
      userEmail: state.user?.email,
      expiresAt: state.tokenExpiresAt,
      refreshExpiresAt: state.refreshTokenExpiresAt,
    };
  }

  /**
   * @deprecated Use getAuthState instead
   */
  public async getAuthState_deprecated(): Promise<any> {
    const storedToken = await this.getStoredToken();

    if (!storedToken) {
      return null;
    }

    return {
      isAuthenticated: true,
      accessToken: storedToken.accessToken,
      refreshToken: storedToken.refreshToken,
      userId: storedToken.userId,
      userEmail: storedToken.userEmail,
      expiresAt: storedToken.expiresAt,
      refreshExpiresAt: storedToken.refreshExpiresAt,
    };
  }

  /**
   * @deprecated Not needed anymore, tokens are refreshed automatically
   */
  public async refreshToken(_refreshToken: string): Promise<TokenData> {
    const storedToken = await this.getStoredToken();
    if (!storedToken) {
      throw new Error('No stored token found');
    }

    await this.refreshTokens();
    const updatedToken = await this.getStoredToken();
    if (!updatedToken) {
      throw new Error('Failed to refresh token');
    }

    return updatedToken;
  }

  /**
   * @deprecated Use ensureValidAccessToken instead
   */
  public async validateToken(accessToken: string): Promise<boolean> {
    try {
      const sessionData = await this.validateTokenWithServer(accessToken);
      return sessionData?.valid || false;
    } catch (_error) {
      return false;
    }
  }
}
