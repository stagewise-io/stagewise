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

import { autoUpdater } from 'electron';
import { DisposableService } from './disposable';
import type { Logger } from './logger';
import type { NotificationService } from './notification';

declare const __APP_RELEASE_CHANNEL__: 'dev' | 'prerelease' | 'release';
declare const __APP_VERSION__: string;
declare const __APP_PLATFORM__: string;
declare const __APP_ARCH__: string;

export class AutoUpdateService extends DisposableService {
  private readonly logger: Logger;
  private readonly notificationService: NotificationService;
  private updateDownloaded = false;
  private updateInfo: {
    releaseName?: string;
    releaseNotes?: string;
    releaseDate?: Date;
    updateURL?: string;
  } | null = null;

  // Check for updates every 30 minutes
  private readonly UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
  private updateCheckIntervalId: ReturnType<typeof setInterval> | null = null;

  private constructor(
    logger: Logger,
    notificationService: NotificationService,
  ) {
    super();
    this.logger = logger;
    this.notificationService = notificationService;
  }

  public static async create(
    logger: Logger,
    notificationService: NotificationService,
  ): Promise<AutoUpdateService> {
    const instance = new AutoUpdateService(logger, notificationService);
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
      return;
    }

    // Don't run in dev builds - they shouldn't auto-update
    if (__APP_RELEASE_CHANNEL__ === 'dev') {
      this.logger.debug(
        '[AutoUpdateService] Auto-updates disabled for dev builds, skipping initialization',
      );
      return;
    }

    const feedURL = this.buildFeedURL();
    if (!feedURL) {
      this.logger.warn(
        '[AutoUpdateService] Could not build feed URL, auto-updates disabled',
      );
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
    } catch (error) {
      this.logger.error(
        '[AutoUpdateService] Failed to initialize auto-updater',
        error,
      );
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

  private getReleaseChannel(): string {
    // Map internal channel names to update server channel names
    switch (__APP_RELEASE_CHANNEL__) {
      case 'release':
        return 'release';
      case 'prerelease':
        return 'beta';
      default:
        return 'alpha';
    }
  }

  private buildFeedURL(): string | null {
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
    const version = __APP_VERSION__;

    // Format: ${UPDATE_SERVER_ORIGIN}/update/stagewise/${RELEASE_CHANNEL}/${PLATFORM}/${ARCH}/${CURRENT_APP_VERSION}
    const feedURL = `${updateServerOrigin}/update/stagewise/${channel}/${platform}/${arch}/${version}`;

    this.logger.debug(
      `[AutoUpdateService] Built feed URL: ${feedURL} (platform: ${platform}, arch: ${arch}, channel: ${channel}, version: ${version})`,
    );

    return feedURL;
  }

  private setupEventHandlers(): void {
    autoUpdater.on('error', (error: Error) => {
      this.logger.error('[AutoUpdateService] Update error:', error);
      this.logger.debug(`[AutoUpdateService] Error message: ${error.message}`);
      this.logger.debug(`[AutoUpdateService] Error stack: ${error.stack}`);
    });

    autoUpdater.on('checking-for-update', () => {
      this.logger.debug('[AutoUpdateService] Checking for updates...');
    });

    autoUpdater.on('update-available', () => {
      this.logger.debug(
        '[AutoUpdateService] Update available, download starting automatically',
      );
    });

    autoUpdater.on('update-not-available', () => {
      this.logger.debug(
        '[AutoUpdateService] No update available, app is up to date',
      );
    });

    autoUpdater.on(
      'update-downloaded',
      (_event, releaseNotes, releaseName, releaseDate, updateURL) => {
        this.updateDownloaded = true;
        this.updateInfo = {
          releaseName,
          releaseNotes,
          releaseDate,
          updateURL,
        };

        this.logger.debug('[AutoUpdateService] Update downloaded successfully');
        this.logger.debug(`[AutoUpdateService] Release name: ${releaseName}`);
        this.logger.debug(`[AutoUpdateService] Release notes: ${releaseNotes}`);
        this.logger.debug(`[AutoUpdateService] Release date: ${releaseDate}`);
        this.logger.debug(`[AutoUpdateService] Update URL: ${updateURL}`);

        // Show notification to user
        this.showUpdateReadyNotification(releaseName);
      },
    );

    autoUpdater.on('before-quit-for-update', () => {
      this.logger.debug(
        '[AutoUpdateService] App is about to quit to install update',
      );
    });
  }

  private showUpdateReadyNotification(releaseName: string): void {
    const versionDisplay = releaseName || 'a new version';

    this.notificationService.showNotification({
      title: 'Update Ready',
      message: `${versionDisplay} has been downloaded and is ready to install.`,
      type: 'info',
      actions: [
        {
          label: 'Restart & Install Now',
          type: 'primary',
          onClick: () => {
            this.quitAndInstall();
          },
        },
        {
          label: 'Later',
          type: 'secondary',
          onClick: () => {
            this.logger.debug(
              '[AutoUpdateService] User chose to install update later',
            );
          },
        },
      ],
    });
  }

  /**
   * Manually trigger an update check
   */
  public checkForUpdates(): void {
    this.assertNotDisposed();

    const platform = this.getPlatform();
    if (platform !== 'macos' && platform !== 'win') {
      this.logger.debug(
        '[AutoUpdateService] Cannot check for updates on unsupported platform',
      );
      return;
    }

    this.logger.debug('[AutoUpdateService] Manually triggering update check');
    try {
      autoUpdater.checkForUpdates();
    } catch (error) {
      this.logger.error(
        '[AutoUpdateService] Error checking for updates:',
        error,
      );
    }
  }

  /**
   * Quit the app and install the downloaded update
   */
  public quitAndInstall(): void {
    this.assertNotDisposed();

    if (!this.updateDownloaded) {
      this.logger.warn(
        '[AutoUpdateService] Cannot quit and install - no update has been downloaded',
      );
      return;
    }

    this.logger.debug(
      '[AutoUpdateService] Quitting app and installing update...',
    );
    autoUpdater.quitAndInstall();
  }

  /**
   * Check if an update has been downloaded and is ready to install
   */
  public isUpdateReady(): boolean {
    return this.updateDownloaded;
  }

  /**
   * Get information about the downloaded update
   */
  public getUpdateInfo(): typeof this.updateInfo {
    return this.updateInfo;
  }

  protected onTeardown(): void {
    if (this.updateCheckIntervalId) {
      clearInterval(this.updateCheckIntervalId);
      this.updateCheckIntervalId = null;
    }
    this.logger.debug('[AutoUpdateService] Teardown complete');
  }
}
