import { webFrameMain, type WebContents } from 'electron';
import type { Logger } from '../../logger';
import { isSafetyRelevantError } from '@shared/chromium-errors/error-classification';

/**
 * Error state tracked by the TabErrorHandler
 */
export interface TabErrorState {
  /** Original URL that failed (preserved across cascading errors) */
  originalFailedUrl: string | null;
  /** Current error code */
  errorCode: number | null;
  /** Error description message */
  errorMessage: string | null;
  /** Whether the error page is currently displayed */
  isErrorPageDisplayed: boolean;
  /** History index before the error occurred (for skip behavior) */
  historyIndexBeforeError: number | null;
}

/**
 * Subframe error tracking
 */
export interface SubframeError {
  /** Unique frame identifier */
  frameId: string;
  /** Process ID of the frame */
  frameProcessId: number;
  /** Routing ID of the frame */
  frameRoutingId: number;
  /** URL that failed to load */
  errorUrl: string;
  /** Chromium error code */
  errorCode: number;
  /** Error description */
  errorMessage: string;
  /** Timestamp when error occurred */
  timestamp: number;
}

/**
 * Callbacks for TabErrorHandler to communicate state changes
 */
export interface TabErrorHandlerCallbacks {
  /** Called when error state changes */
  onErrorStateUpdate: (state: TabErrorState) => void;
  /** Called when subframe errors array changes */
  onSubframeErrorsUpdate: (errors: SubframeError[]) => void;
  /** Called to update the display URL (shown in address bar) */
  onDisplayUrlUpdate: (url: string) => void;
  /** Called when loading state should change */
  onLoadingStateUpdate: (isLoading: boolean) => void;
}

const MAX_SUBFRAME_ERRORS = 50;
const ERROR_PAGE_PATH = '/error/page-load-failed';

/**
 * TabErrorHandler manages error states for a browser tab.
 *
 * Responsibilities:
 * - Hook into did-fail-load and certificate-error events
 * - Navigate to error pages for main frame errors
 * - Navigate subframes to error pages for non-safety subframe errors
 * - Track original failed URL for reload behavior
 * - Provide navigation offsets to skip error pages during back/forward
 */
export class TabErrorHandler {
  private readonly webContents: WebContents;
  private readonly logger: Logger;
  private readonly callbacks: TabErrorHandlerCallbacks;

  /** Current error state */
  private errorState: TabErrorState = {
    originalFailedUrl: null,
    errorCode: null,
    errorMessage: null,
    isErrorPageDisplayed: false,
    historyIndexBeforeError: null,
  };

  /** Subframe errors (ring buffer) */
  private subframeErrors: SubframeError[] = [];

  /** Whether we're in the process of navigating to an error page */
  private isNavigatingToErrorPage = false;

  /** Listener references for cleanup */
  private boundHandleDidFailLoad: (
    event: Electron.Event,
    errorCode: number,
    errorDescription: string,
    validatedUrl: string,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number,
  ) => void;
  private boundHandleCertificateError: (
    event: Electron.Event,
    url: string,
    error: string,
    certificate: Electron.Certificate,
    callback: (isTrusted: boolean) => void,
    isMainFrame: boolean,
  ) => void;
  private boundHandleDidNavigate: (event: Electron.Event, url: string) => void;
  private boundHandleDidStartNavigation: (
    event: Electron.Event,
    url: string,
    isInPlace: boolean,
    isMainFrame: boolean,
  ) => void;

  constructor(
    webContents: WebContents,
    logger: Logger,
    callbacks: TabErrorHandlerCallbacks,
  ) {
    this.webContents = webContents;
    this.logger = logger;
    this.callbacks = callbacks;

    // Bind event handlers
    this.boundHandleDidFailLoad = this.handleDidFailLoad.bind(this);
    this.boundHandleCertificateError = this.handleCertificateError.bind(this);
    this.boundHandleDidNavigate = this.handleDidNavigate.bind(this);
    this.boundHandleDidStartNavigation =
      this.handleDidStartNavigation.bind(this);

    this.setupEventListeners();
  }

  /**
   * Set up WebContents event listeners
   */
  private setupEventListeners(): void {
    const wc = this.webContents;

    // Handle load failures
    wc.on('did-fail-load', this.boundHandleDidFailLoad);

    // Handle certificate errors
    wc.on('certificate-error', this.boundHandleCertificateError);

    // Clear error state on successful navigation away from error page
    wc.on('did-navigate', this.boundHandleDidNavigate);

    // Handle navigation start - opportunity to prepare for new navigation
    wc.on('did-start-navigation', this.boundHandleDidStartNavigation);
  }

  /**
   * Handle did-fail-load event
   */
  private handleDidFailLoad(
    _event: Electron.Event,
    errorCode: number,
    errorDescription: string,
    validatedUrl: string,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number,
  ): void {
    // Ignore abort errors (user stopped navigation, navigation replaced, etc.)
    if (errorCode === -3) {
      return;
    }

    // Ignore errors while navigating to error page to prevent loops
    if (this.isNavigatingToErrorPage) {
      return;
    }

    // Ignore errors on error page itself
    if (validatedUrl.includes(ERROR_PAGE_PATH)) {
      return;
    }

    this.logger.debug(
      `[TabErrorHandler] did-fail-load: code=${errorCode}, url=${validatedUrl}, isMainFrame=${isMainFrame}`,
    );

    if (isMainFrame) {
      this.handleMainFrameError(errorCode, errorDescription, validatedUrl);
    } else {
      this.handleSubframeError(
        errorCode,
        errorDescription,
        validatedUrl,
        frameProcessId,
        frameRoutingId,
      );
    }
  }

  /**
   * Handle certificate-error event
   */
  private handleCertificateError(
    _event: Electron.Event,
    url: string,
    error: string,
    _certificate: Electron.Certificate,
    callback: (isTrusted: boolean) => void,
    isMainFrame: boolean,
  ): void {
    // Always reject untrusted certificates for safety (V1 - no bypass option)
    callback(false);

    // Ignore if already navigating to error page
    if (this.isNavigatingToErrorPage) {
      return;
    }

    this.logger.debug(
      `[TabErrorHandler] certificate-error: error=${error}, url=${url}, isMainFrame=${isMainFrame}`,
    );

    // Handle certificate errors as safety-relevant errors
    // Use error code -200 (CERT_COMMON_NAME_INVALID) as a generic cert error code
    const errorCode = -200;
    const errorMessage = `Certificate error: ${error}`;

    if (isMainFrame) {
      this.handleMainFrameError(errorCode, errorMessage, url);
    } else {
      // Subframe certificate errors are treated as safety-relevant
      // Navigate full page to error with subresource URL
      this.handleMainFrameError(errorCode, errorMessage, url, url);
    }
  }

  /**
   * Handle main frame error - navigate full page to error page
   */
  private handleMainFrameError(
    errorCode: number,
    errorDescription: string,
    failedUrl: string,
    subresourceUrl?: string,
  ): void {
    // Track original URL only on first error (preserve across cascading errors)
    if (!this.errorState.originalFailedUrl) {
      this.errorState.originalFailedUrl = failedUrl;
    }

    this.errorState.errorCode = errorCode;
    this.errorState.errorMessage = errorDescription;

    // Track history index before error for skip behavior
    const navHistory = this.webContents.navigationHistory;
    this.errorState.historyIndexBeforeError = navHistory.getActiveIndex();

    // Update display URL to show failed URL (not error page URL)
    this.callbacks.onDisplayUrlUpdate(this.errorState.originalFailedUrl);

    // Navigate to error page
    this.navigateToErrorPage(
      errorCode,
      errorDescription,
      failedUrl,
      subresourceUrl,
    );
  }

  /**
   * Handle subframe error - depends on safety relevance
   */
  private handleSubframeError(
    errorCode: number,
    errorDescription: string,
    failedUrl: string,
    frameProcessId: number,
    frameRoutingId: number,
  ): void {
    const isSafety = isSafetyRelevantError(errorCode);

    if (isSafety) {
      // Safety-relevant subframe errors navigate full page with subresource URL
      this.handleMainFrameError(
        errorCode,
        errorDescription,
        this.webContents.getURL(), // Current page URL as the "failed" URL
        failedUrl, // Actual failed resource as subresource
      );
      return;
    }

    // Non-safety subframe errors: navigate just the frame
    this.navigateFrameToError(
      frameProcessId,
      frameRoutingId,
      errorCode,
      errorDescription,
      failedUrl,
    );

    // Track subframe error in state
    const subframeError: SubframeError = {
      frameId: `${frameProcessId}:${frameRoutingId}`,
      frameProcessId,
      frameRoutingId,
      errorUrl: failedUrl,
      errorCode,
      errorMessage: errorDescription,
      timestamp: Date.now(),
    };

    // Ring buffer behavior
    if (this.subframeErrors.length >= MAX_SUBFRAME_ERRORS) {
      this.subframeErrors.shift();
    }
    this.subframeErrors.push(subframeError);

    this.callbacks.onSubframeErrorsUpdate([...this.subframeErrors]);
  }

  /**
   * Navigate to error page using location.replace() to avoid adding history entry
   */
  private async navigateToErrorPage(
    errorCode: number,
    errorMessage: string,
    errorUrl: string,
    subresourceUrl?: string,
  ): Promise<void> {
    const errorPageUrl = this.buildErrorPageUrl(
      errorCode,
      errorMessage,
      errorUrl,
      subresourceUrl,
    );

    this.isNavigatingToErrorPage = true;
    this.errorState.isErrorPageDisplayed = true;

    // Update loading state
    this.callbacks.onLoadingStateUpdate(false);

    try {
      // Use location.replace to avoid adding new history entry
      await this.webContents.executeJavaScript(`
        (function() {
          try {
            window.location.replace('${errorPageUrl.replace(/'/g, "\\'")}');
          } catch (e) {
            // Fallback to direct navigation if executeJavaScript fails
            window.location.href = '${errorPageUrl.replace(/'/g, "\\'")}';
          }
        })();
      `);

      this.logger.debug(
        `[TabErrorHandler] Navigated to error page for ${errorUrl}, code=${errorCode}`,
      );
    } catch (err) {
      this.logger.error(
        `[TabErrorHandler] Failed to navigate to error page: ${err}`,
      );
      // Fallback: direct loadURL (will add history entry, but at least shows error)
      try {
        await this.webContents.loadURL(errorPageUrl);
      } catch (loadErr) {
        this.logger.error(
          `[TabErrorHandler] Fallback loadURL also failed: ${loadErr}`,
        );
      }
    } finally {
      this.isNavigatingToErrorPage = false;
    }

    // Notify state update
    this.callbacks.onErrorStateUpdate({ ...this.errorState });
  }

  /**
   * Navigate a specific subframe to error page
   */
  private async navigateFrameToError(
    frameProcessId: number,
    frameRoutingId: number,
    errorCode: number,
    errorMessage: string,
    errorUrl: string,
  ): Promise<void> {
    const errorPageUrl = this.buildErrorPageUrl(
      errorCode,
      errorMessage,
      errorUrl,
      undefined,
      true, // isSubframe
    );

    try {
      const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
      if (frame && !frame.url.includes(ERROR_PAGE_PATH)) {
        await frame.executeJavaScript(`
          window.location.replace('${errorPageUrl.replace(/'/g, "\\'")}');
        `);
        this.logger.debug(
          `[TabErrorHandler] Navigated subframe to error page for ${errorUrl}`,
        );
      }
    } catch (err) {
      // Frame might be destroyed or inaccessible - that's OK
      this.logger.debug(
        `[TabErrorHandler] Could not navigate subframe: ${err}`,
      );
    }
  }

  /**
   * Build error page URL with query parameters
   */
  private buildErrorPageUrl(
    errorCode: number,
    errorMessage: string,
    errorUrl: string,
    subresourceUrl?: string,
    isSubframe = false,
  ): string {
    const params = new URLSearchParams();
    params.set('errorUrl', errorUrl);
    params.set('errorCode', errorCode.toString());
    params.set('errorMessage', errorMessage);

    if (subresourceUrl) {
      params.set('subresourceUrl', subresourceUrl);
    }

    if (isSubframe) {
      params.set('isSubframe', 'true');
    }

    return `stagewise://internal${ERROR_PAGE_PATH}?${params.toString()}`;
  }

  /**
   * Handle did-navigate event - clear error state if navigating away from error page
   */
  private handleDidNavigate(_event: Electron.Event, url: string): void {
    if (this.errorState.isErrorPageDisplayed) {
      // If navigating away from error page, clear error state
      if (!url.includes(ERROR_PAGE_PATH)) {
        this.clearErrorState();
      }
    }
  }

  /**
   * Handle did-start-navigation - prepare for new navigation from error page
   */
  private handleDidStartNavigation(
    _event: Electron.Event,
    url: string,
    _isInPlace: boolean,
    isMainFrame: boolean,
  ): void {
    if (!isMainFrame) return;

    // If starting navigation from error page to a non-error page
    if (
      this.errorState.isErrorPageDisplayed &&
      !url.includes(ERROR_PAGE_PATH)
    ) {
      // The new navigation will replace the error page in history
      // We'll clean up when did-navigate fires
      this.logger.debug(
        `[TabErrorHandler] Starting navigation away from error page to ${url}`,
      );
    }
  }

  /**
   * Get the URL to reload (original failed URL if on error page)
   */
  public getReloadUrl(): string | null {
    if (
      this.errorState.isErrorPageDisplayed &&
      this.errorState.originalFailedUrl
    ) {
      return this.errorState.originalFailedUrl;
    }
    return null;
  }

  /**
   * Check if we should intercept reload
   */
  public shouldInterceptReload(): boolean {
    return (
      this.errorState.isErrorPageDisplayed &&
      this.errorState.originalFailedUrl !== null
    );
  }

  /**
   * Get navigation offset to skip error pages during back/forward
   *
   * @param direction - 'back' or 'forward'
   * @returns Offset to use with goToOffset, or null if no skip needed
   */
  public getNavigationOffset(direction: 'back' | 'forward'): number | null {
    if (!this.errorState.isErrorPageDisplayed) {
      return null; // No skip needed, use standard navigation
    }

    // When on an error page, we just need standard back/forward behavior.
    // The error page was shown via location.replace() which replaced the failed
    // navigation entry in history. Going back by 1 will go to the page the user
    // was on before attempting the failed navigation.
    if (direction === 'back') {
      return -1;
    } else {
      return 1;
    }
  }

  /**
   * Check if navigation history should skip an index
   */
  public shouldSkipHistoryIndex(_index: number): boolean {
    // In V1, we use location.replace so error pages don't create new history entries
    // This method is here for future use if we change the navigation strategy
    return false;
  }

  /**
   * Get current error state (immutable copy)
   */
  public getErrorState(): Readonly<TabErrorState> {
    return { ...this.errorState };
  }

  /**
   * Get subframe errors (immutable copy)
   */
  public getSubframeErrors(): readonly SubframeError[] {
    return [...this.subframeErrors];
  }

  /**
   * Clear all subframe errors
   */
  public clearSubframeErrors(): void {
    this.subframeErrors = [];
    this.callbacks.onSubframeErrorsUpdate([]);
  }

  /**
   * Clear error state (called when navigating away from error page)
   */
  private clearErrorState(): void {
    this.errorState = {
      originalFailedUrl: null,
      errorCode: null,
      errorMessage: null,
      isErrorPageDisplayed: false,
      historyIndexBeforeError: null,
    };

    this.callbacks.onErrorStateUpdate({ ...this.errorState });
    this.logger.debug('[TabErrorHandler] Error state cleared');
  }

  /**
   * Manually clear error state (e.g., when starting a new navigation)
   */
  public resetErrorState(): void {
    this.clearErrorState();
  }

  /**
   * Clean up event listeners
   */
  public destroy(): void {
    const wc = this.webContents;

    if (!wc.isDestroyed()) {
      wc.off('did-fail-load', this.boundHandleDidFailLoad);
      wc.off('certificate-error', this.boundHandleCertificateError);
      wc.off('did-navigate', this.boundHandleDidNavigate);
      wc.off('did-start-navigation', this.boundHandleDidStartNavigation);
    }

    this.clearErrorState();
    this.subframeErrors = [];

    this.logger.debug('[TabErrorHandler] Destroyed');
  }
}
