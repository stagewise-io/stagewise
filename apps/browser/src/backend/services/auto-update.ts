/**
 * AutoUpdateService - Handles automatic app updates using Electron's autoUpdater.
 *
 * This service is responsible for:
 * - Checking for updates from the configured update server
 * - Downloading updates automatically when available
 * - Notifying the user when an update is ready to install
 * - Triggering app restart to install updates
 *
 * Platform support: macOS and Windows only (Linux is not supported by Electron's autoUpdater)
 */

import { autoUpdater, dialog } from 'electron';
import { DisposableService } from './disposable';
import type { Logger } from './logger';
import type { NotificationService } from './notification';
import type { TelemetryService } from './telemetry';
import type { PreferencesService } from './preferences';
import type { KartonService } from './karton';
import type { UpdateChannel } from '@shared/karton-contracts/ui/shared-types';

declare const __APP_RELEASE_CHANNEL__:
  | 'dev'
  | 'prerelease'
  | 'nightly'
  | 'release';
declare const __APP_VERSION__: string;
declare const __APP_PLATFORM__: string;
declare const __APP_ARCH__: string;

type UpdateInfo = {
  releaseName: string;
  releaseNotes?: string;
};

export class AutoUpdateService extends DisposableService {
  private readonly logger: Logger;
  private readonly notificationService: NotificationService;
  private readonly telemetryService: TelemetryService;
  private readonly preferencesService: PreferencesService;
  private readonly uiKarton: KartonService;
  private pendingUpdate: UpdateInfo | null = null;
  private downloadingUpdate: UpdateInfo | null = null;
  private updateCheckInProgress = false;
  private updateCheckRequestId = 0;
  private updateNotificationId: string | null = null;

  // Check for updates every 30 minutes
  private readonly UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
  private updateCheckIntervalId: ReturnType<typeof setInterval> | null = null;

  private constructor(
    logger: Logger,
    notificationService: NotificationService,
    telemetryService: TelemetryService,
    preferencesService: PreferencesService,
    uiKarton: KartonService,
  ) {
    super();
    this.logger = logger;
    this.notificationService = notificationService;
    this.telemetryService = telemetryService;
    this.preferencesService = preferencesService;
    this.uiKarton = uiKarton;
  }

  private report(
    error: Error,
    operation: string,
    extra?: Record<string, unknown>,
  ) {
    this.telemetryService.captureException(error, {
      service: 'auto-update',
      operation,
      ...extra,
    });
  }

  public static async create(
    logger: Logger,
    notificationService: NotificationService,
    telemetryService: TelemetryService,
    preferencesService: PreferencesService,
    uiKarton: KartonService,
  ): Promise<AutoUpdateService> {
    const instance = new AutoUpdateService(
      logger,
      notificationService,
      telemetryService,
      preferencesService,
      uiKarton,
    );
    await instance.initialize();
    return instance;
  }

  private async initialize(): Promise<void> {
    // Only run on macOS and Windows
    const platform = this.getPlatform();
    if (platform !== 'macos' && platform !== 'win') {
      this.logger.debug(
        '[AutoUpdateService] Auto-updates not supported on this platform, skipping initialization',
      );
      this.setAutoUpdateState('unsupported');
      return;
    }

    if (__APP_RELEASE_CHANNEL__ === 'dev') {
      this.logger.debug(
        '[AutoUpdateService] Auto-updates disabled for dev builds',
      );
      this.setAutoUpdateState('unsupported');
      return;
    }

    const feedURL = this.buildUpdateURL('update');
    if (!feedURL) {
      this.logger.warn(
        '[AutoUpdateService] Could not build feed URL, auto-updates disabled',
      );
      this.setAutoUpdateState('unsupported');
      return;
    }

    this.logger.debug(
      `[AutoUpdateService] Initializing with feed URL: ${feedURL}`,
    );

    try {
      // Set up event handlers before setting feed URL
      this.setupEventHandlers();

      // Configure the auto updater
      autoUpdater.setFeedURL({ url: feedURL });

      this.logger.debug('[AutoUpdateService] Feed URL configured successfully');

      // Don't check immediately on first launch (Squirrel.Windows lock issue)
      // Wait 10 seconds before first check
      setTimeout(() => {
        if (!this.disposed) {
          this.checkForUpdates();
        }
      }, 10000);

      // Set up periodic update checks
      this.updateCheckIntervalId = setInterval(() => {
        if (!this.disposed) {
          this.checkForUpdates();
        }
      }, this.UPDATE_CHECK_INTERVAL_MS);

      // Listen for preference changes to update the feed URL when channel changes
      this.preferencesService.addListener((newPrefs, oldPrefs) => {
        if (newPrefs.updateChannel !== oldPrefs.updateChannel) {
          this.onUpdateChannelChanged();
        }
      });

      this.registerProcedureHandlers();
    } catch (error) {
      this.logger.error(
        '[AutoUpdateService] Failed to initialize auto-updater',
        error,
      );
      this.report(error as Error, 'initialize');
      this.setAutoUpdateState('unsupported');
    }
  }

  private registerProcedureHandlers(): void {
    this.uiKarton.registerServerProcedureHandler(
      'autoUpdate.checkForUpdates',
      async () => this.checkForUpdates(),
    );
    this.uiKarton.registerServerProcedureHandler(
      'autoUpdate.quitAndInstall',
      async () => this.quitAndInstall(),
    );
  }

  /**
   * Called when the user changes the update channel preference.
   * Re-configures the feed URL and triggers an immediate update check.
   */
  private onUpdateChannelChanged(): void {
    const feedURL = this.buildUpdateURL('update');
    if (!feedURL) {
      this.logger.warn(
        '[AutoUpdateService] Could not build feed URL after channel change',
      );
      return;
    }

    this.logger.debug(
      `[AutoUpdateService] Update channel changed, new feed URL: ${feedURL}`,
    );

    try {
      autoUpdater.setFeedURL({ url: feedURL });

      // Let an active Electron download finish; otherwise restart the preflight
      // against the new channel while preserving any installable update.
      if (!this.downloadingUpdate) {
        this.updateCheckRequestId += 1;
        this.updateCheckInProgress = false;
        this.checkForUpdates();
      }
    } catch (error) {
      this.logger.error(
        '[AutoUpdateService] Failed to reconfigure feed URL after channel change',
        error,
      );
      this.report(error as Error, 'onUpdateChannelChanged');
    }
  }

  private getPlatform(): 'macos' | 'win' | 'linux' {
    const platform = __APP_PLATFORM__;
    if (platform === 'darwin') return 'macos';
    if (platform === 'win32') return 'win';
    return 'linux';
  }

  private getArch(): 'arm64' | 'x64' {
    const arch = __APP_ARCH__;
    return arch === 'arm64' ? 'arm64' : 'x64';
  }

  /**
   * Infer the default update channel from the installed version string.
   * e.g. "1.0.0-alpha003" → 'alpha', "1.0.0-beta001" → 'beta'
   */
  private inferChannelFromVersion(): UpdateChannel {
    const version = __APP_VERSION__;
    if (version.includes('-alpha')) {
      return 'alpha';
    }
    // Default to beta for any other prerelease version
    return 'beta';
  }

  /**
   * Get the effective update channel for the update server.
   * For release builds, always use 'release'.
   * For prerelease builds, use the user's configured channel or infer from version.
   */
  private getReleaseChannel(): string {
    switch (__APP_RELEASE_CHANNEL__) {
      case 'release':
        return 'release';
      case 'nightly':
        return 'nightly';
      case 'prerelease': {
        const prefs = this.preferencesService.get();
        return prefs.updateChannel ?? this.inferChannelFromVersion();
      }
      default:
        return 'alpha';
    }
  }

  private buildUpdateURL(
    endpoint: 'update' | 'update-info',
    version = __APP_VERSION__,
  ): string | null {
    const updateServerOrigin = process.env.UPDATE_SERVER_ORIGIN;

    if (!updateServerOrigin) {
      this.logger.warn(
        '[AutoUpdateService] UPDATE_SERVER_ORIGIN environment variable not set',
      );
      return null;
    }

    const platform = this.getPlatform();
    const arch = this.getArch();
    const channel = this.getReleaseChannel();
    const url = `${updateServerOrigin}/${endpoint}/stagewise/${channel}/${platform}/${arch}/${version}`;

    this.logger.debug(
      `[AutoUpdateService] Built ${endpoint} URL: ${url} (platform: ${platform}, arch: ${arch}, channel: ${channel}, version: ${version})`,
    );

    return url;
  }

  private setupEventHandlers(): void {
    autoUpdater.on('error', (error: Error) => {
      this.logger.error('[AutoUpdateService] Update error:', error);
      this.logger.debug(`[AutoUpdateService] Error message: ${error.message}`);
      this.logger.debug(`[AutoUpdateService] Error stack: ${error.stack}`);
      this.report(error, 'autoUpdaterError');
      this.finishFailedUpdateAttempt('error', error.message);
    });

    autoUpdater.on('update-not-available', () => {
      this.logger.debug(
        '[AutoUpdateService] No update available, app is up to date',
      );
      this.finishFailedUpdateAttempt('not-available');
    });

    autoUpdater.on(
      'update-downloaded',
      (_event, releaseNotes, releaseName, releaseDate, updateURL) => {
        this.pendingUpdate = {
          releaseName,
          releaseNotes:
            this.downloadingUpdate?.releaseName === releaseName
              ? this.downloadingUpdate.releaseNotes || releaseNotes || undefined
              : releaseNotes || undefined,
        };
        this.updateCheckInProgress = false;
        this.downloadingUpdate = null;

        this.logger.debug('[AutoUpdateService] Update downloaded successfully');
        this.logger.debug(
          `[AutoUpdateService] Release name: ${this.pendingUpdate.releaseName}`,
        );
        this.logger.debug(
          `[AutoUpdateService] Release notes: ${this.pendingUpdate.releaseNotes}`,
        );
        this.logger.debug(`[AutoUpdateService] Release date: ${releaseDate}`);
        this.logger.debug(`[AutoUpdateService] Update URL: ${updateURL}`);

        this.showUpdateNotification(true, this.pendingUpdate);
        this.setAutoUpdateState('ready', this.pendingUpdate);
      },
    );

    autoUpdater.on('before-quit-for-update', () => {
      this.logger.debug(
        '[AutoUpdateService] App is about to quit to install update',
      );
    });
  }

  private dismissUpdateNotification(): void {
    if (!this.updateNotificationId) return;

    this.notificationService.dismissNotification(this.updateNotificationId);
    this.updateNotificationId = null;
  }

  private showUpdateNotification(ready: boolean, update: UpdateInfo): void {
    const viewChangelogAction = {
      label: 'View Changelog',
      type: 'secondary' as const,
      onClick: () => {
        this.uiKarton.setState((draft) => {
          draft.appScreen.mode = 'settings';
          draft.appScreen.settingsRoute = { section: 'about' };
        });
      },
    };

    this.dismissUpdateNotification();
    this.updateNotificationId = this.notificationService.showNotification({
      title: ready
        ? `Update ${update.releaseName} is ready`
        : `Update ${update.releaseName} is available`,
      message: ready
        ? 'Downloaded and ready to install.'
        : 'Downloading in the background.',
      type: 'info',
      icon: ready ? undefined : 'spinner',
      actions: ready
        ? [
            {
              label: 'Restart & Install Now',
              type: 'primary',
              onClick: () => void this.quitAndInstall(),
            },
            viewChangelogAction,
          ]
        : [viewChangelogAction],
    });
  }

  private finishFailedUpdateAttempt(
    fallbackStatus: 'not-available' | 'error',
    errorMessage?: string,
  ): void {
    const replacementDownloadStarted = Boolean(this.downloadingUpdate);
    this.updateCheckInProgress = false;
    this.downloadingUpdate = null;

    if (this.pendingUpdate) {
      if (replacementDownloadStarted) {
        this.showUpdateNotification(true, this.pendingUpdate);
        this.setAutoUpdateState('ready', this.pendingUpdate);
      }
      return;
    }

    this.dismissUpdateNotification();
    this.setAutoUpdateState(fallbackStatus, null, errorMessage);
  }

  // Preflight because Electron downloads immediately from checkForUpdates().
  private async checkForNewerVersion(): Promise<void> {
    const currentVersion = this.pendingUpdate?.releaseName ?? __APP_VERSION__;
    const updateInfoURL = this.buildUpdateURL('update-info', currentVersion);
    if (!updateInfoURL) {
      this.logger.warn(
        '[AutoUpdateService] Could not build update info URL, skipping check',
      );
      return;
    }

    const requestId = ++this.updateCheckRequestId;
    this.updateCheckInProgress = true;
    if (!this.pendingUpdate) this.setAutoUpdateState('checking', null);

    try {
      const response = await fetch(updateInfoURL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });

      if (requestId !== this.updateCheckRequestId || this.disposed) return;
      if (response.status === 204) {
        this.finishFailedUpdateAttempt('not-available');
        return;
      }
      if (!response.ok) {
        throw new Error(
          `Update info request failed: ${response.status} ${response.statusText}`,
        );
      }

      const metadata = (await response.json()) as {
        version?: unknown;
        notes?: string;
      };
      if (requestId !== this.updateCheckRequestId || this.disposed) return;
      if (typeof metadata.version !== 'string' || !metadata.version) {
        throw new Error('Update info response missing version');
      }

      this.downloadingUpdate = {
        releaseName: metadata.version,
        releaseNotes: metadata.notes,
      };

      this.logger.debug(
        `[AutoUpdateService] Newer version ${metadata.version} found, starting Electron updater`,
      );
      this.showUpdateNotification(false, this.downloadingUpdate);
      this.setAutoUpdateState('downloading', this.downloadingUpdate);
      autoUpdater.checkForUpdates();
    } catch (error) {
      if (requestId !== this.updateCheckRequestId || this.disposed) return;
      this.logger.error(
        '[AutoUpdateService] Error checking update metadata:',
        error,
      );
      this.report(error as Error, 'checkUpdateMetadata', { currentVersion });
      this.finishFailedUpdateAttempt('error', (error as Error).message);
    }
  }

  /**
   * Manually trigger an update check
   */
  public checkForUpdates(): void {
    this.assertNotDisposed();

    if (this.updateCheckInProgress) {
      this.logger.debug(
        '[AutoUpdateService] Skipping update check - another check is in progress',
      );
      return;
    }

    this.logger.debug('[AutoUpdateService] Manually triggering update check');
    void this.checkForNewerVersion();
  }

  /**
   * Quit the app and install the downloaded update
   */
  public async quitAndInstall(): Promise<void> {
    this.assertNotDisposed();

    if (!this.pendingUpdate) {
      this.logger.warn(
        '[AutoUpdateService] Cannot quit and install - no update has been downloaded',
      );
      return;
    }

    if (this.downloadingUpdate) {
      this.logger.warn(
        '[AutoUpdateService] Cannot install while a newer update is downloading',
      );
      return;
    }

    const hasWorkingAgents = Object.values(
      this.uiKarton.state.agents.instances,
    ).some((agent) => agent.state.isWorking);

    if (hasWorkingAgents) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'Install Update',
        message: 'Agents are still working',
        detail: 'Restarting now will stop them. Install the update anyway?',
        buttons: ['Restart & Install', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (response !== 0 || this.downloadingUpdate) return;
    }

    this.logger.debug(
      '[AutoUpdateService] Quitting app and installing update...',
    );
    autoUpdater.quitAndInstall();
  }

  /**
   * Push auto-update status to the UI via Karton state.
   */
  private setAutoUpdateState(
    status:
      | 'idle'
      | 'checking'
      | 'downloading'
      | 'ready'
      | 'not-available'
      | 'error'
      | 'unsupported',
    updateInfo?: UpdateInfo | null,
    errorMessage?: string | null,
  ): void {
    this.uiKarton.setState((draft) => {
      draft.autoUpdate.status = status;
      if (updateInfo !== undefined) {
        draft.autoUpdate.updateInfo = updateInfo;
      }
      draft.autoUpdate.errorMessage = errorMessage ?? null;
    });
  }

  protected onTeardown(): void {
    this.updateCheckRequestId += 1;
    if (this.updateCheckIntervalId) {
      clearInterval(this.updateCheckIntervalId);
      this.updateCheckIntervalId = null;
    }
    this.uiKarton.removeServerProcedureHandler('autoUpdate.checkForUpdates');
    this.uiKarton.removeServerProcedureHandler('autoUpdate.quitAndInstall');
    this.logger.debug('[AutoUpdateService] Teardown complete');
  }
}
