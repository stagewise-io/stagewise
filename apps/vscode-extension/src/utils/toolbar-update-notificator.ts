import * as vscode from 'vscode';
import { StorageService } from './storage-service';
import { EnvironmentInfo } from './environment-info';
import { updateToolbar } from 'src/auto-prompts/update-toolbar';
import { compareVersions } from './lock-file-parsers/version-comparator';
import { AnalyticsService, EventName } from './analytics-service';
import { getWorkspaceId } from './get-workspace-id';

interface ToolbarVersionInfo {
  installedVersion: string;
  latestVersion: string;
  workspaceId: string;
}

export class ToolbarUpdateNotificator implements vscode.Disposable {
  private static instance: ToolbarUpdateNotificator;
  private static readonly STORAGE_KEY_PREFIX = 'toolbar_version_';
  private storage: StorageService = StorageService.getInstance();
  private disposables: vscode.Disposable[] = [];
  private analyticsService = AnalyticsService.getInstance();

  private constructor() {}

  public static getInstance(): ToolbarUpdateNotificator {
    if (!ToolbarUpdateNotificator.instance) {
      ToolbarUpdateNotificator.instance = new ToolbarUpdateNotificator();
    }
    return ToolbarUpdateNotificator.instance;
  }

  public initialize() {
    console.log('[ToolbarUpdateNotificator]: Initializing');
    void this.setupWorkspaceListener().catch((err) =>
      console.error('[ToolbarUpdateNotificator] Failed to initialise', err),
    );
  }

  private async setupWorkspaceListener() {
    console.log('[ToolbarUpdateNotificator]: Setting up workspace listener');
    // Listen for workspace folder changes
    const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(
      async () => {
        const workspaceId = await getWorkspaceId();
        if (workspaceId) {
          await this.checkForUpdates(workspaceId);
        }
      },
    );

    // Also check when the extension is activated
    const initialWorkspaceId = await getWorkspaceId();
    if (initialWorkspaceId) {
      this.checkForUpdates(initialWorkspaceId).catch((error) => {
        console.error(
          '[ToolbarUpdateNotificator] Error checking for updates on initial load:',
          error,
        );
      });
    }

    this.disposables.push(workspaceListener);
  }

  public dispose() {
    console.log('[ToolbarUpdateNotificator] Disposing...');
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  /**
   * Checks if the toolbar needs an update and shows a notification if necessary
   * @param workspaceId The unique identifier of the current workspace
   */
  public async checkForUpdates(workspaceId: string): Promise<void> {
    const envInfo = EnvironmentInfo.getInstance();

    const installedVersion = envInfo.getToolbarInstalledVersion();
    const latestVersion = envInfo.getLatestAvailableToolbarVersion();

    if (!installedVersion || !latestVersion) {
      return;
    }

    // Skip version check for development versions
    if (installedVersion === 'dev') {
      return;
    }

    const storageKey = `${ToolbarUpdateNotificator.STORAGE_KEY_PREFIX}${workspaceId}`;
    const storedVersion =
      await this.storage.get<ToolbarVersionInfo>(storageKey);

    // If we've already notified about this version, don't show again
    if (storedVersion?.latestVersion === latestVersion) {
      return;
    }

    // Compare versions (assuming semantic versioning)
    if (compareVersions(installedVersion, latestVersion) < 0) {
      this.showUpdateNotification(
        storageKey,
        workspaceId,
        installedVersion,
        latestVersion,
      );
    }
  }

  private async showUpdateNotification(
    storageKey: string,
    workspaceId: string,
    installedVersion: string,
    latestVersion: string,
  ): Promise<void> {
    console.log('Showing update notification');
    const message = `Your currently installed version of stagewise is outdated (${installedVersion})! We recommend updating to the latest version of stagewise (${latestVersion}) in order to keep compatibility with the extension and benefit from the latest features.`;

    vscode.window
      .showInformationMessage(message, 'Auto-update', 'Ignore')
      .then(async (result) => {
        if (result === 'Auto-update') {
          this.analyticsService.trackEvent(
            EventName.TOOLBAR_UPDATE_NOTIFICATION_AUTO_UPDATE,
          );
          await this.sendToolbarAutoUpdatePrompt(workspaceId, latestVersion);
          return 'Auto-update';
        } else if (result === 'Ignore') {
          this.analyticsService.trackEvent(
            EventName.TOOLBAR_UPDATE_NOTIFICATION_IGNORED,
          );
          await this.storage.set<ToolbarVersionInfo>(storageKey, {
            installedVersion,
            latestVersion,
            workspaceId,
          });
          return 'Ignore';
        } else {
          this.analyticsService.trackEvent(
            EventName.TOOLBAR_UPDATE_NOTIFICATION_DISMISSED,
          );
          return 'Dismissed';
        }
      });
    this.analyticsService.trackEvent(
      EventName.SHOW_TOOLBAR_UPDATE_NOTIFICATION,
    );
  }

  private async sendToolbarAutoUpdatePrompt(
    workspaceId: string,
    targetVersion: string,
  ): Promise<void> {
    console.log('[ToolbarUpdateNotificator] Sending auto-update prompt:', {
      workspaceId,
      targetVersion,
    });
    // Dummy function for auto-update functionality
    console.log(
      `Auto-update requested for workspace ${workspaceId} to version ${targetVersion}`,
    );
    await updateToolbar();
    await vscode.window.showInformationMessage(
      "The agent has been started to update your stagewise packages. Please follow the agent's instructions in the chat panel.",
      'OK',
    );
  }
}
