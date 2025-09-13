import axios from 'axios';
import { log } from '../utils/logger';
import { tokenManager, type TokenData } from './token-manager';
import { analyticsEvents } from '../utils/telemetry';
import { createNodeApiClient } from '@stagewise/api-client';
import open from 'open';

// Configuration
const STAGEWISE_CONSOLE_URL =
  process.env.STAGEWISE_CONSOLE_URL || 'https://console.stagewise.io';

const API_URL = process.env.API_URL || 'https://v1.api.stagewise.io';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
}

interface AuthState {
  isAuthenticated: boolean;
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
  userEmail?: string;
  expiresAt?: string;
  refreshExpiresAt?: string;
}

interface SessionValidationResponse {
  valid: boolean;
  userId: string;
  userEmail: string;
  extensionId: string;
  createdAt: string;
  isExpiringSoon: boolean;
}

export class UnifiedOAuthManager {
  private refreshPromise: Promise<void> | null = null;
  private cachedAccessToken: string | null = null;
  private cachedRefreshToken: string | null = null;
  private authInitiatedAutomatically = false;
  private pendingAuthResolve: ((value: TokenData) => void) | null = null;
  private pendingAuthReject: ((error: Error) => void) | null = null;

  async initiateOAuthFlow(
    serverPort: number,
    _successRedirectUrl?: string,
    initiatedAutomatically = false,
  ): Promise<TokenData> {
    this.authInitiatedAutomatically = initiatedAutomatically;

    // Check and clear existing tokens
    const existingToken = await tokenManager.getStoredToken();
    if (existingToken) {
      try {
        await this.revokeToken(
          existingToken.accessToken,
          existingToken.refreshToken,
        );
      } catch (error) {
        log.warn(
          `Failed to revoke old tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
      this.cachedAccessToken = null;
      this.cachedRefreshToken = null;
      await tokenManager.clearToken();
    }

    // Build redirect URI using the main server port - under stagewise-toolbar-app to avoid conflicts
    const redirectUri = `http://localhost:${serverPort}/stagewise-toolbar-app/auth/callback`;

    // Track auth initiated event
    await analyticsEvents.cliAuthInitiated(initiatedAutomatically);

    // Create a promise that will be resolved when callback is received
    const authPromise = new Promise<TokenData>((resolve, reject) => {
      this.pendingAuthResolve = resolve;
      this.pendingAuthReject = reject;

      // Set timeout for auth flow
      setTimeout(
        () => {
          if (this.pendingAuthReject) {
            this.pendingAuthReject(new Error('Authentication timeout'));
            this.pendingAuthResolve = null;
            this.pendingAuthReject = null;
          }
        },
        5 * 60 * 1000,
      ); // 5 minute timeout
    });

    // Open authentication URL in browser
    const authUrl = `${STAGEWISE_CONSOLE_URL}/authenticate-ide?ide=cli&redirect_uri=${encodeURIComponent(redirectUri)}`;

    if (process.env.NODE_ENV !== 'test') {
      log.info('Opening authentication URL in your browser...');
      try {
        await open(authUrl);
      } catch (error) {
        log.error(
          `Failed to open browser: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        log.info(`Please open this URL manually: ${authUrl}`);
      }
    } else {
      log.debug(`[TEST MODE] Would open: ${authUrl}`);
    }

    return authPromise;
  }

  async handleCallback(code: string, _state?: string): Promise<void> {
    try {
      // Exchange code for tokens
      const tokenData = await this.exchangeCodeForToken(code);

      // Store tokens
      await tokenManager.storeToken(tokenData);
      this.cachedAccessToken = tokenData.accessToken;
      this.cachedRefreshToken = tokenData.refreshToken;

      // Track auth completion
      await analyticsEvents.cliAuthCompleted({
        auto_initiated: this.authInitiatedAutomatically,
      });

      // Resolve pending auth promise
      if (this.pendingAuthResolve) {
        this.pendingAuthResolve(tokenData);
        this.pendingAuthResolve = null;
        this.pendingAuthReject = null;
      }
    } catch (error) {
      log.error(
        `Authentication callback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      if (this.pendingAuthReject) {
        this.pendingAuthReject(
          error instanceof Error ? error : new Error('Authentication failed'),
        );
        this.pendingAuthResolve = null;
        this.pendingAuthReject = null;
      }

      throw error;
    }
  }

  private async exchangeCodeForToken(code: string): Promise<TokenData> {
    try {
      const response = await axios.post<{
        tokens: TokenPair;
        user: { userId: string; email: string };
      }>(`${API_URL}/auth/exchange-code`, { code });

      const { tokens, user } = response.data;

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        userId: user.userId,
        userEmail: user.email,
        expiresAt: tokens.expiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        throw new Error(`Failed to exchange authorization code: ${message}`);
      }
      throw error;
    }
  }

  async getAuthState(): Promise<AuthState | null> {
    const tokenData = await tokenManager.getStoredToken();
    if (!tokenData) {
      return null;
    }

    // Check if tokens need refresh
    const now = new Date();
    const accessExpiry = new Date(tokenData.expiresAt);
    const refreshExpiry = new Date(tokenData.refreshExpiresAt);

    // If refresh token is expired, clear everything
    if (refreshExpiry <= now) {
      log.debug('Refresh token expired, clearing authentication');
      await this.logout();
      return null;
    }

    // If access token is expired or will expire soon, refresh it
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    if (accessExpiry <= fiveMinutesFromNow) {
      log.debug('Access token expired or expiring soon, refreshing...');
      try {
        await this.refreshTokens();
        // Get updated token data
        const updatedTokenData = await tokenManager.getStoredToken();
        if (updatedTokenData) {
          return {
            isAuthenticated: true,
            accessToken: updatedTokenData.accessToken,
            refreshToken: updatedTokenData.refreshToken,
            userId: updatedTokenData.userId,
            userEmail: updatedTokenData.userEmail,
            expiresAt: updatedTokenData.expiresAt,
            refreshExpiresAt: updatedTokenData.refreshExpiresAt,
          };
        }
      } catch (error) {
        log.error(
          `Failed to refresh tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        await this.logout();
        return null;
      }
    }

    return {
      isAuthenticated: true,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      userId: tokenData.userId,
      userEmail: tokenData.userEmail,
      expiresAt: tokenData.expiresAt,
      refreshExpiresAt: tokenData.refreshExpiresAt,
    };
  }

  async refreshTokens(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performTokenRefresh(): Promise<void> {
    const tokenData = await tokenManager.getStoredToken();
    if (!tokenData) {
      throw new Error('No stored tokens to refresh');
    }

    try {
      const response = await axios.post<{
        tokens: TokenPair;
        user: { userId: string; email: string };
      }>(`${API_URL}/auth/refresh`, {
        refreshToken: tokenData.refreshToken,
      });

      const { tokens, user } = response.data;

      const newTokenData: TokenData = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        userId: user.userId,
        userEmail: user.email,
        expiresAt: tokens.expiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      };

      await tokenManager.storeToken(newTokenData);
      this.cachedAccessToken = newTokenData.accessToken;
      this.cachedRefreshToken = newTokenData.refreshToken;

      log.debug('Tokens refreshed successfully');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          log.debug('Refresh token invalid, clearing authentication');
          await this.logout();
          throw new Error('Authentication expired. Please log in again.');
        }
        const message = error.response?.data?.message || error.message;
        throw new Error(`Failed to refresh tokens: ${message}`);
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    const tokenData = await tokenManager.getStoredToken();
    if (tokenData) {
      try {
        await this.revokeToken(tokenData.accessToken, tokenData.refreshToken);
      } catch (error) {
        log.warn(
          `Failed to revoke tokens on logout: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    this.cachedAccessToken = null;
    this.cachedRefreshToken = null;
    await tokenManager.clearToken();
  }

  private async revokeToken(
    accessToken: string,
    refreshToken: string,
  ): Promise<void> {
    try {
      await axios.post(`${API_URL}/auth/revoke`, {
        accessToken,
        refreshToken,
      });
      log.debug('Tokens revoked successfully');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        throw new Error(`Failed to revoke tokens: ${message}`);
      }
      throw error;
    }
  }

  async getToken(): Promise<{
    accessToken: string;
    refreshToken: string;
  } | null> {
    const authState = await this.getAuthState();
    if (!authState?.isAuthenticated) {
      return null;
    }

    return {
      accessToken: authState.accessToken!,
      refreshToken: authState.refreshToken!,
    };
  }

  async checkAuthStatus(): Promise<AuthState> {
    const authState = await this.getAuthState();
    return authState || { isAuthenticated: false };
  }

  async getSubscription(): Promise<any> {
    const authState = await this.getAuthState();
    if (!authState?.isAuthenticated) {
      return null;
    }

    const apiClient = createNodeApiClient({
      accessToken: authState.accessToken!,
    });

    try {
      const subscription = await apiClient.subscription.get();
      return subscription;
    } catch (error) {
      log.error(
        `Failed to get subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }
}

// Export singleton instance for compatibility
export const unifiedOAuthManager = new UnifiedOAuthManager();
