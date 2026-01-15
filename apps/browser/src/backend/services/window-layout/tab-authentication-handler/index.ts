import type {
  WebContents,
  AuthenticationResponseDetails,
  AuthInfo,
} from 'electron';
import type { Logger } from '../../logger';
import type { AuthenticationRequest } from '@shared/karton-contracts/ui';
import { randomUUID } from 'node:crypto';

/**
 * Pending authentication request with callback for resolution.
 */
interface PendingRequest {
  request: AuthenticationRequest;
  /** Callback to resolve the authentication request */
  callback: (username?: string, password?: string) => void;
}

/**
 * Callbacks for TabAuthenticationHandler to communicate state changes
 */
export interface TabAuthenticationHandlerCallbacks {
  /** Called when authentication request changes (new request or cleared) */
  onAuthRequestUpdate: (request: AuthenticationRequest | null) => void;
}

/**
 * TabAuthenticationHandler manages HTTP Basic Auth requests for a browser tab.
 *
 * Responsibilities:
 * - Listen to webContents 'login' event for basic auth challenges
 * - Maintain pending request state synced to UI via Karton
 * - Handle user responses (submit credentials or cancel)
 * - Clean up requests on navigation
 */
export class TabAuthenticationHandler {
  private readonly tabId: string;
  private readonly webContents: WebContents;
  private readonly logger: Logger;
  private readonly callbacks: TabAuthenticationHandlerCallbacks;

  /** Current pending authentication request (only one at a time per tab) */
  private pendingRequest: PendingRequest | null = null;

  // Bound event handlers for cleanup
  private boundHandleLogin: (
    event: Electron.Event,
    details: AuthenticationResponseDetails,
    authInfo: AuthInfo,
    callback: (username?: string, password?: string) => void,
  ) => void;
  private boundHandleDidNavigate: (event: Electron.Event, url: string) => void;

  constructor(
    tabId: string,
    webContents: WebContents,
    logger: Logger,
    callbacks: TabAuthenticationHandlerCallbacks,
  ) {
    this.tabId = tabId;
    this.webContents = webContents;
    this.logger = logger;
    this.callbacks = callbacks;

    // Bind event handlers
    this.boundHandleLogin = this.handleLogin.bind(this);
    this.boundHandleDidNavigate = this.handleDidNavigate.bind(this);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for basic auth challenges
    // Note: Using type assertion as the 'login' event type isn't fully typed on WebContents
    (this.webContents as NodeJS.EventEmitter).on(
      'login',
      this.boundHandleLogin,
    );

    // Clear requests on navigation (JS sandbox is destroyed)
    this.webContents.on('did-navigate', this.boundHandleDidNavigate);
  }

  /**
   * Handle HTTP Basic Auth challenge from webContents.
   */
  private handleLogin(
    event: Electron.Event,
    details: AuthenticationResponseDetails,
    authInfo: AuthInfo,
    callback: (username?: string, password?: string) => void,
  ): void {
    // Prevent default behavior (which cancels the auth)
    event.preventDefault();

    // If there's already a pending request, cancel it first
    if (this.pendingRequest) {
      this.logger.debug(
        `[TabAuthenticationHandler] Cancelling previous auth request for new one`,
      );
      this.pendingRequest.callback(); // Cancel without credentials
    }

    const requestId = randomUUID();
    let origin: string;
    try {
      origin = new URL(details.url).origin;
    } catch {
      origin = `${authInfo.scheme}://${authInfo.host}:${authInfo.port}`;
    }

    const request: AuthenticationRequest = {
      id: requestId,
      timestamp: Date.now(),
      url: details.url,
      origin,
      realm: authInfo.realm || undefined,
      host: authInfo.host,
      tabId: this.tabId,
    };

    this.pendingRequest = {
      request,
      callback,
    };

    this.callbacks.onAuthRequestUpdate(request);

    this.logger.debug(
      `[TabAuthenticationHandler] Auth request created: ${requestId} for ${authInfo.host}`,
    );
  }

  /**
   * Handle navigation. Clears pending request since the page context changes.
   */
  private handleDidNavigate(_event: Electron.Event, _url: string): void {
    if (this.pendingRequest) {
      this.logger.debug(
        `[TabAuthenticationHandler] Navigation detected, cancelling pending auth request`,
      );
      // Cancel the auth request (don't call callback - it may have already been resolved)
      this.pendingRequest = null;
      this.callbacks.onAuthRequestUpdate(null);
    }
  }

  /**
   * Submit credentials for the pending authentication request.
   */
  public submitCredentials(
    requestId: string,
    username: string,
    password: string,
  ): void {
    if (!this.pendingRequest || this.pendingRequest.request.id !== requestId) {
      this.logger.warn(
        `[TabAuthenticationHandler] No pending request with ID: ${requestId}`,
      );
      return;
    }

    this.logger.debug(
      `[TabAuthenticationHandler] Submitting credentials for: ${requestId}`,
    );

    // Call the callback with credentials
    this.pendingRequest.callback(username, password);
    this.pendingRequest = null;
    this.callbacks.onAuthRequestUpdate(null);
  }

  /**
   * Cancel the pending authentication request.
   */
  public cancelAuth(requestId: string): void {
    if (!this.pendingRequest || this.pendingRequest.request.id !== requestId) {
      this.logger.warn(
        `[TabAuthenticationHandler] No pending request with ID: ${requestId}`,
      );
      return;
    }

    this.logger.debug(
      `[TabAuthenticationHandler] Cancelling auth request: ${requestId}`,
    );

    // Call callback without credentials to cancel
    this.pendingRequest.callback();
    this.pendingRequest = null;
    this.callbacks.onAuthRequestUpdate(null);
  }

  /**
   * Get the current pending request (for state checking).
   */
  public getPendingRequest(): AuthenticationRequest | null {
    return this.pendingRequest?.request ?? null;
  }

  /**
   * Clean up event listeners when the handler is destroyed.
   */
  public destroy(): void {
    // Note: Using type assertion as the 'login' event type isn't fully typed on WebContents
    (this.webContents as NodeJS.EventEmitter).off(
      'login',
      this.boundHandleLogin,
    );
    this.webContents.off('did-navigate', this.boundHandleDidNavigate);

    // Cancel any pending request
    if (this.pendingRequest) {
      this.pendingRequest.callback();
      this.pendingRequest = null;
    }
  }
}
