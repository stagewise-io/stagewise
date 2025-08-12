import axios from 'axios';
import { createServer, type Server } from 'node:http';
import { URL } from 'node:url';
import { log } from '../utils/logger';
import { tokenManager, type TokenData } from './token-manager';
import open from 'open';
import { analyticsEvents } from '../utils/telemetry';
import { createNodeApiClient } from '@stagewise/api-client';

// Configuration
const STAGEWISE_CONSOLE_URL =
  process.env.STAGEWISE_CONSOLE_URL || 'https://console.stagewise.io';

const API_URL = process.env.API_URL || 'https://v1.api.stagewise.io';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // Access token expiry (1 hour)
  refreshExpiresAt: string; // Refresh token expiry (30 days)
}

interface AuthState {
  isAuthenticated: boolean;
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
  userEmail?: string;
  expiresAt?: string; // Access token expiry
  refreshExpiresAt?: string; // Refresh token expiry
  hasEarlyAgentAccess?: boolean;
}

interface SessionValidationResponse {
  valid: boolean;
  userId: string;
  userEmail: string;
  extensionId: string;
  createdAt: string;
  isExpiringSoon: boolean;
  hasEarlyAgentAccess: boolean;
}

export class OAuthManager {
  private server: Server | null = null;
  private connections = new Set<any>();
  private refreshPromise: Promise<void> | null = null;
  private cachedAccessToken: string | null = null;
  private authInitiatedAutomatically = false;

  async initiateOAuthFlow(
    port: number,
    successRedirectUrl?: string,
    initiatedAutomatically = false,
  ): Promise<TokenData> {
    // Store the flag for use in the completion event
    this.authInitiatedAutomatically = initiatedAutomatically;
    // Check if user is already authenticated and clear old tokens
    const existingToken = await tokenManager.getStoredToken();
    if (existingToken) {
      // Revoke old tokens on server
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

      // Clear cached access token
      this.cachedAccessToken = null;

      // Clear stored authentication state
      await tokenManager.clearToken();
    }

    // Build redirect URI
    const redirectUri = `http://localhost:${port}/auth/callback`;

    // Track auth initiated event
    await analyticsEvents.cliAuthInitiated(initiatedAutomatically);

    // Start callback server first - this will throw if it fails
    const authCodePromise = this.startCallbackServer(port, successRedirectUrl);

    // Only proceed with browser opening if server started successfully
    // Wait a bit to ensure server is ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Open authentication URL in browser with redirect_uri
    const authUrl = `${STAGEWISE_CONSOLE_URL}/authenticate-ide?ide=cli&redirect_uri=${encodeURIComponent(redirectUri)}`;

    if (process.env.NODE_ENV !== 'test') {
      log.info('Opening authentication URL in your browser...');

      try {
        await open(authUrl);
      } catch (_error) {
        // If open fails, show the URL for manual opening
        log.info(`Please visit the following URL to authenticate:`);
        log.info(authUrl);
      }
    } else {
      // In test environment, just log the URL without opening browser
      log.debug(`Authentication URL: ${authUrl}`);
    }

    // Wait for auth code
    const authCode = await authCodePromise;

    // Exchange auth code for tokens
    return await this.exchangeAuthCode(authCode);
  }

  private async exchangeAuthCode(authCode: string): Promise<TokenData> {
    try {
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
      const sessionResponse = await axios.get(
        `${STAGEWISE_CONSOLE_URL}/auth/extension/session`,
        {
          headers: {
            Authorization: `Bearer ${tokenPair.accessToken}`,
          },
          timeout: 30000,
        },
      );

      if (sessionResponse.status !== 200) {
        throw new Error(sessionResponse.data.error || 'Failed to get session');
      }

      const sessionData: SessionValidationResponse = sessionResponse.data;

      log.debug(`Successfully authenticated as: ${sessionData.userEmail}`);
      if (sessionData.hasEarlyAgentAccess) {
        log.debug('✅ Early Agent Access enabled');
      }

      const tokenData: TokenData = {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresAt: tokenPair.expiresAt,
        refreshExpiresAt: tokenPair.refreshExpiresAt,
        userId: sessionData.userId,
        userEmail: sessionData.userEmail,
        hasEarlyAgentAccess: sessionData.hasEarlyAgentAccess,
      };

      // Update cached access token
      this.cachedAccessToken = tokenPair.accessToken;

      // Store tokens
      await tokenManager.storeToken(tokenData);

      // Track auth completed event
      await analyticsEvents.cliAuthCompleted(this.authInitiatedAutomatically);

      return tokenData;
    } catch (error) {
      // Log the error for debugging
      log.error('Authentication failed during token exchange');

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

      // For any other error, throw a generic message
      throw new Error('Authentication failed - please try again later');
    }
  }

  private startCallbackServer(
    port: number,
    successRedirectUrl?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      this.server = createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost:${port}`);

        if (url.pathname === '/') {
          res.writeHead(200, {
            'Content-Type': 'text/html',
            Connection: 'close',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          });
          res.end(
            `<html>
                <head>
                  <title>Authorization Failed</title>
                  <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 50px; }
                    h1 { color: #d73a49; }
                    p { color: #666; margin: 20px 0; }
                  </style>
                </head>
                <body>
                  <h1>Authorization in progress...</h1>
                  <p>Please wait until the stagewise CLI is authenticated to access your app.</p>
                  <script>
                    // Close window after 3 seconds
                    setTimeout(() => {
                      window.close();
                    }, 3000);
                  </script>
                </body>
              </html>`,
          );
          return;
        }

        if (url.pathname === '/auth/callback') {
          const authCode = url.searchParams.get('authCode');
          const expiresAt = url.searchParams.get('expiresAt');
          const error = url.searchParams.get('error');

          // Set CORS headers
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET');

          if (error) {
            res.writeHead(400, {
              'Content-Type': 'text/html',
              Connection: 'close',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
            });
            res.end(
              `<html>
                <head>
                  <title>Authorization Failed</title>
                  <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 50px; }
                    h1 { color: #d73a49; }
                    p { color: #666; margin: 20px 0; }
                  </style>
                </head>
                <body>
                  <h1>Authorization Failed</h1>
                  <p>Please try again.</p>
                  <script>
                    // Close window after 3 seconds
                    setTimeout(() => {
                      window.close();
                    }, 3000);
                  </script>
                </body>
              </html>`,
            );

            if (!resolved) {
              resolved = true;
              this.stopServer().then(() => {
                reject(new Error(`OAuth error: ${error}`));
              });
            }
            return;
          }

          if (authCode && expiresAt) {
            // Validate auth code format
            if (!authCode.trim() || authCode.length < 10) {
              res.writeHead(400, {
                'Content-Type': 'text/html',
                Connection: 'close',
                'Cache-Control': 'no-store, no-cache, must-revalidate',
              });
              res.end(
                `<html>
                  <head>
                    <title>Invalid Auth Code</title>
                    <style>
                      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 50px; }
                      h1 { color: #d73a49; }
                      p { color: #666; margin: 20px 0; }
                    </style>
                  </head>
                  <body>
                    <h1>Invalid Auth Code</h1>
                    <p>Please try again.</p>
                    <script>
                      // Close window after 3 seconds
                      setTimeout(() => {
                        window.close();
                      }, 3000);
                    </script>
                  </body>
                </html>`,
              );

              if (!resolved) {
                resolved = true;
                this.stopServer().then(() => {
                  reject(new Error('Invalid auth code format'));
                });
              }
              return;
            }

            res.writeHead(200, {
              'Content-Type': 'text/html',
              Connection: 'close',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
            });
            res.end(
              `<html>
                <head>
                  <title>Authorization Successful</title>
                  <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 50px; }
                    h1 { color: #333; }
                    p { color: #666; margin: 20px 0; }
                    .spinner {
                      display: inline-block;
                      width: 20px;
                      height: 20px;
                      border: 3px solid rgba(0,0,0,.1);
                      border-radius: 50%;
                      border-top-color: #333;
                      animation: spin 1s ease-in-out infinite;
                      margin-left: 10px;
                    }
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                  </style>
                </head>
                <body>
                  <h1>Authorization Successful</h1>
                  <p>${successRedirectUrl ? 'Redirecting to your dev app...' : 'You can close this window now.'}</p>
                  <p style="color: #999; font-size: 14px;">${successRedirectUrl ? 'Please wait...' : ''}</p>
                  <script>
                    ${
                      successRedirectUrl
                        ? `// Redirect to operational proxy server
                         setTimeout(() => {
                           window.location.href = '${successRedirectUrl}';
                         }, 3000);`
                        : `// Close window after 3 seconds
                         setTimeout(() => {
                           window.close();
                         }, 3000);`
                    }
                  </script>
                </body>
              </html>`,
            );

            if (!resolved) {
              resolved = true;
              this.stopServer().then(() => {
                resolve(authCode);
              });
            }
            return;
          }
        }

        res.writeHead(404, {
          Connection: 'close',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        });
        res.end();
      });

      this.server.on('error', (error: any) => {
        if (!resolved) {
          resolved = true;
          if (error.code === 'EADDRINUSE') {
            reject(
              new Error(
                `Port ${port} is already in use. Please close any other applications using this port and try again.`,
              ),
            );
          } else if (error.code === 'EACCES') {
            reject(
              new Error(
                `Permission denied to use port ${port}. Try using a different port or running with appropriate permissions.`,
              ),
            );
          } else {
            reject(
              new Error(
                `Failed to start authentication server: ${error.message}`,
              ),
            );
          }
        }
      });

      // Track connections to ensure clean shutdown
      this.server.on('connection', (connection) => {
        this.connections.add(connection);
        connection.on('close', () => {
          this.connections.delete(connection);
        });
      });

      this.server.listen(port, () => {
        log.debug(`OAuth callback server listening on port ${port}`);
      });

      // Timeout after 5 minutes
      setTimeout(
        () => {
          if (!resolved) {
            resolved = true;
            this.stopServer().then(() => {
              reject(
                new Error('Authentication timeout - no response received'),
              );
            });
          }
        },
        5 * 60 * 1000,
      );
    });
  }

  private stopServer(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Destroy all active connections
      this.connections.forEach((connection) => {
        connection.destroy();
      });
      this.connections.clear();

      // Close the server
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  private async refreshTokens(): Promise<void> {
    const storedToken = await tokenManager.getStoredToken();

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
      const sessionResponse = await axios.get(
        `${STAGEWISE_CONSOLE_URL}/auth/extension/session`,
        {
          headers: {
            Authorization: `Bearer ${tokenPair.accessToken}`,
          },
          timeout: 30000,
        },
      );

      if (sessionResponse.status !== 200) {
        throw new Error(sessionResponse.data.error || 'Failed to get session');
      }

      const sessionData: SessionValidationResponse = sessionResponse.data;

      const tokenData: TokenData = {
        ...storedToken,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresAt: tokenPair.expiresAt,
        refreshExpiresAt: tokenPair.refreshExpiresAt,
        userId: sessionData.userId,
        userEmail: sessionData.userEmail,
        hasEarlyAgentAccess: sessionData.hasEarlyAgentAccess,
      };

      // Update cached access token
      this.cachedAccessToken = tokenPair.accessToken;

      // Update stored tokens
      await tokenManager.storeToken(tokenData);
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

  /**
   * Check if access token is expired or expiring soon
   */
  private isAccessTokenExpired(expiresAt: string): boolean {
    const expiryTime = new Date(expiresAt);
    const now = new Date();
    // Consider token expired if it expires within 2 minutes (buffer)
    const bufferTime = 2 * 60 * 1000; // 2 minutes in milliseconds
    return expiryTime.getTime() - now.getTime() <= bufferTime;
  }

  /**
   * Ensure we have a valid access token, refreshing if necessary
   */
  async ensureValidAccessToken(): Promise<string> {
    // If there's already a refresh in progress, wait for it
    if (this.refreshPromise) {
      await this.refreshPromise;
      this.refreshPromise = null;
    }

    const authState = await this.getAuthState();

    if (!authState?.isAuthenticated || !authState.accessToken) {
      throw new Error('Not authenticated');
    }

    // Check if access token is expired or expiring soon
    if (authState.expiresAt && this.isAccessTokenExpired(authState.expiresAt)) {
      // Start refresh process
      this.refreshPromise = this.refreshTokens();
      await this.refreshPromise;
      this.refreshPromise = null;

      // Get updated auth state after refresh
      const updatedAuthState = await this.getAuthState();
      if (!updatedAuthState?.accessToken) {
        throw new Error('Failed to refresh access token');
      }
      return updatedAuthState.accessToken;
    }

    return authState.accessToken;
  }

  /**
   * Validate a token with the server
   */
  async validateToken(accessToken: string): Promise<boolean> {
    // Allow test tokens in test environment
    if (process.env.NODE_ENV === 'test' && accessToken === 'test-token') {
      return true;
    }

    try {
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
        const sessionData: SessionValidationResponse = response.data;
        return sessionData.valid;
      }

      return false;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        return false;
      }
      // For other errors (network issues), assume token might still be valid
      log.debug(`Failed to validate token: ${error}`);
      return true;
    }
  }

  /**
   * Logout from stagewise
   */
  async logout(): Promise<void> {
    const authState = await this.getAuthState();

    // Try to revoke tokens on server side first
    if (authState?.refreshToken || authState?.accessToken) {
      try {
        await this.revokeToken(authState.accessToken, authState.refreshToken);
      } catch (error) {
        // Don't fail logout if revoke fails (network issues, etc.)
        log.warn(
          `Failed to revoke tokens on server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    // Clear stored authentication
    await tokenManager.clearToken();

    // Clear cached access token
    this.cachedAccessToken = null;
  }

  /**
   * Check authentication status
   */
  async checkAuthStatus(): Promise<AuthState> {
    const storedToken = await tokenManager.getStoredToken();

    // If no local auth state, user is not authenticated
    if (!storedToken?.accessToken) {
      return { isAuthenticated: false };
    }

    try {
      // Ensure we have a valid access token (will refresh if needed)
      const accessToken = await this.ensureValidAccessToken();

      // Validate session with backend
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
        const sessionData: SessionValidationResponse = response.data;

        if (sessionData.valid) {
          // Update auth state with latest information
          const updatedToken: TokenData = {
            ...storedToken,
            userId: sessionData.userId,
            userEmail: sessionData.userEmail,
            hasEarlyAgentAccess: sessionData.hasEarlyAgentAccess,
          };

          if (JSON.stringify(updatedToken) !== JSON.stringify(storedToken)) {
            await tokenManager.storeToken(updatedToken);
          }

          const authState: AuthState = {
            isAuthenticated: true,
            accessToken: updatedToken.accessToken,
            refreshToken: updatedToken.refreshToken,
            userId: updatedToken.userId,
            userEmail: updatedToken.userEmail,
            expiresAt: updatedToken.expiresAt,
            refreshExpiresAt: updatedToken.refreshExpiresAt,
            hasEarlyAgentAccess: updatedToken.hasEarlyAgentAccess,
          };

          return authState;
        } else {
          // Session is invalid, clear auth state
          await this.logout();
          return { isAuthenticated: false };
        }
      } else {
        throw new Error('Failed to validate session');
      }
    } catch (error) {
      // Handle network errors or other issues
      if (
        error instanceof Error &&
        (error.message.includes('authenticate again') ||
          error.message.includes('Refresh token'))
      ) {
        // Already handled by token refresh logic
        return { isAuthenticated: false };
      }

      // For other errors (network issues, etc.), assume still authenticated but show warning
      log.warn(
        'Unable to verify authentication status. Please check your connection.',
      );
      const authState: AuthState = {
        isAuthenticated: true,
        accessToken: storedToken.accessToken,
        refreshToken: storedToken.refreshToken,
        userId: storedToken.userId,
        userEmail: storedToken.userEmail,
        expiresAt: storedToken.expiresAt,
        refreshExpiresAt: storedToken.refreshExpiresAt,
        hasEarlyAgentAccess: storedToken.hasEarlyAgentAccess,
      };
      return authState;
    }
  }

  /**
   * Get current authentication state
   */
  async getAuthState(): Promise<AuthState | null> {
    const storedToken = await tokenManager.getStoredToken();

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
      hasEarlyAgentAccess: storedToken.hasEarlyAgentAccess,
    };
  }

  /**
   * Get the currently saved access token immediately (without refresh)
   */
  async getAccessToken(): Promise<string | null> {
    // Return cached token if available
    if (this.cachedAccessToken) {
      return this.cachedAccessToken;
    }

    // Load from storage for the first time and cache it
    const authState = await this.getAuthState();
    if (authState?.accessToken) {
      this.cachedAccessToken = authState.accessToken;
      return this.cachedAccessToken;
    }

    return null;
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const authState = await this.getAuthState();
    if (!authState?.isAuthenticated || !authState.accessToken) {
      return false;
    }

    // Check if refresh token is expired
    if (
      authState.refreshExpiresAt &&
      new Date(authState.refreshExpiresAt) <= new Date()
    ) {
      await this.logout();
      return false;
    }

    return true;
  }

  /**
   * Check if the authenticated user has early agent access
   */
  async hasEarlyAgentAccess(): Promise<boolean> {
    const authState = await this.getAuthState();
    return authState?.hasEarlyAgentAccess ?? false;
  }

  /**
   * Check if the authenticated user has a subscription
   */
  async getSubscription() {
    const authState = await this.getAuthState();
    if (!authState?.accessToken) {
      throw new Error('No access token found');
    }

    const client = createNodeApiClient({
      baseUrl: API_URL,
      headers: {
        Authorization: `Bearer ${authState?.accessToken}`,
      },
    });
    const subscription = await client.subscription.getSubscription.query();
    return subscription;
  }

  /**
   * Revoke a specific token
   */
  async revokeToken(token?: string, refreshToken?: string): Promise<void> {
    if (!token && !refreshToken) {
      return;
    }

    const body = refreshToken ? { refreshToken } : { token };

    // For token revocation, we don't need authentication - the token itself is the credential
    await axios.post(`${STAGEWISE_CONSOLE_URL}/auth/extension/revoke`, body, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * For backward compatibility with the existing interface
   */
  async refreshToken(_refreshToken: string): Promise<TokenData> {
    const storedToken = await tokenManager.getStoredToken();
    if (!storedToken) {
      throw new Error('No stored token found');
    }

    await this.refreshTokens();
    const updatedToken = await tokenManager.getStoredToken();
    if (!updatedToken) {
      throw new Error('Failed to refresh token');
    }

    return updatedToken;
  }
}

export const oauthManager = new OAuthManager();
