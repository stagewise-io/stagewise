import * as vscode from 'vscode';
import type { ExtensionStorage } from '../data-storage';
import { EnvironmentInfo } from './environment-info';
import { updateToolbar } from 'src/auto-prompts/update-toolbar';

interface ToolbarVersionInfo {
  installedVersion: string;
  latestVersion: string;
  workspaceId: string;
}

export class ToolbarUpdateNotificator {
  private static readonly STORAGE_KEY_PREFIX = 'toolbar_version_';
  private storage: ExtensionStorage;
  private environmentInfo: EnvironmentInfo | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(storage: ExtensionStorage) {
    console.log('[ToolbarUpdateNotificator] Initializing...');
    this.storage = storage;
    this.setupWorkspaceListener();
  }

  private setupWorkspaceListener() {
    console.log('[ToolbarUpdateNotificator] Setting up workspace listener...');

    // Listen for workspace folder changes
    const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(
      async () => {
        console.log('[ToolbarUpdateNotificator] Workspace folders changed');
        const workspaceId = vscode.env.machineId;
        if (workspaceId) {
          console.log(
            `[ToolbarUpdateNotificator] Checking updates for workspace: ${workspaceId}`,
          );
          await this.checkForUpdates(workspaceId);
        } else {
          console.warn('[ToolbarUpdateNotificator] No workspace ID available');
        }
      },
    );

    // Also check when the extension is activated
    const initialWorkspaceId = vscode.env.machineId;
    if (initialWorkspaceId) {
      console.log(
        `[ToolbarUpdateNotificator] Performing initial check for workspace: ${initialWorkspaceId}`,
      );
      this.checkForUpdates(initialWorkspaceId).catch((error) => {
        console.error(
          '[ToolbarUpdateNotificator] Error checking for updates on initial load:',
          error,
        );
      });
    } else {
      console.warn(
        '[ToolbarUpdateNotificator] No workspace ID available for initial check',
      );
    }

    this.disposables.push(workspaceListener);
    console.log('[ToolbarUpdateNotificator] Workspace listener setup complete');
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
    console.log(
      `[ToolbarUpdateNotificator] Starting update check for workspace: ${workspaceId}`,
    );

    if (!this.environmentInfo) {
      console.log('[ToolbarUpdateNotificator] Initializing EnvironmentInfo...');
      this.environmentInfo = await EnvironmentInfo.getInstance();
    }

    const installedVersion = this.environmentInfo.getToolbarInstalledVersion();
    const latestVersion =
      this.environmentInfo.getLatestAvailableToolbarVersion();

    console.log('[ToolbarUpdateNotificator] Version info:', {
      installedVersion,
      latestVersion,
    });

    if (!installedVersion || !latestVersion) {
      console.log(
        '[ToolbarUpdateNotificator] Missing version information, skipping update check',
      );
      return;
    }

    // Skip version check for development versions
    if (installedVersion === 'dev') {
      console.log(
        '[ToolbarUpdateNotificator] Development version detected, skipping update check',
      );
      return;
    }

    const storageKey = `${ToolbarUpdateNotificator.STORAGE_KEY_PREFIX}${workspaceId}`;
    const storedVersion =
      await this.storage.get<ToolbarVersionInfo>(storageKey);

    console.log(
      '[ToolbarUpdateNotificator] Stored version info:',
      storedVersion,
    );

    // If we've already notified about this version, don't show again
    if (storedVersion?.latestVersion === latestVersion) {
      console.log(
        '[ToolbarUpdateNotificator] Already notified about this version, skipping',
      );
      return;
    }

    // Compare versions (assuming semantic versioning)
    if (this.isVersionOutdated(installedVersion, latestVersion)) {
      console.log(
        '[ToolbarUpdateNotificator] Update available, showing notification',
      );
      this.showUpdateNotification(
        storageKey,
        workspaceId,
        installedVersion,
        latestVersion,
      );
    } else {
      console.log('[ToolbarUpdateNotificator] No update needed');
    }
  }

  private isVersionOutdated(installed: string, latest: string): boolean {
    console.log('[ToolbarUpdateNotificator] Comparing versions:', {
      installed,
      latest,
    });
    const installedParts = installed.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (latestParts[i] > installedParts[i]) {
        console.log('[ToolbarUpdateNotificator] Version is outdated');
        return true;
      }
      if (latestParts[i] < installedParts[i]) {
        console.log('[ToolbarUpdateNotificator] Version is newer than latest');
        return false;
      }
    }
    console.log('[ToolbarUpdateNotificator] Versions are equal');
    return false;
  }

  private async showUpdateNotification(
    storageKey: string,
    workspaceId: string,
    installedVersion: string,
    latestVersion: string,
  ): Promise<void> {
    console.log('[ToolbarUpdateNotificator] Showing update notification:', {
      storageKey,
      workspaceId,
      installedVersion,
      latestVersion,
    });

    const message = `A new version of the stagewise toolbar is available (${latestVersion}). You are currently using version ${installedVersion}. We highly recommend updating to benefit from the latest features.`;

    const result = await vscode.window.showInformationMessage(
      message,
      'Auto-update',
      'Ignore',
    );

    console.log('[ToolbarUpdateNotificator] User response:', result);

    if (result === 'Ignore') {
      console.log('[ToolbarUpdateNotificator] User chose to ignore update');
      // Store the version info to prevent showing the notification again
      await this.storage.set<ToolbarVersionInfo>(storageKey, {
        installedVersion,
        latestVersion,
        workspaceId,
      });
    } else if (result === 'Auto-update') {
      console.log('[ToolbarUpdateNotificator] User chose to auto-update');
      await this.sendToolbarAutoUpdatePrompt(workspaceId, latestVersion);
    }
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
