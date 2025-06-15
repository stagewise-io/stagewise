import * as vscode from 'vscode';
import type { ExtensionStorage } from '../data-storage';
import { EnvironmentInfo } from './environment-info';
import { trackEvent, EventName } from './analytics';
import { getWorkspaceId } from './get-workspace-id';
import { setupToolbar } from 'src/auto-prompts/setup-toolbar';

export class ToolbarIntegrationNotificator {
  private storage: ExtensionStorage;
  private disposables: vscode.Disposable[] = [];

  constructor(storage: ExtensionStorage) {
    console.log('[ToolbarIntegrationNotificator]: Constructor');
    this.storage = storage;
    void this.setupWorkspaceListener();
  }

  private async setupWorkspaceListener() {
    console.log(
      '[ToolbarIntegrationNotificator]: Setting up workspace listener',
    );
    // Listen for workspace folder changes
    const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(
      async () => {
        const workspaceId = await getWorkspaceId();
        if (workspaceId) {
          await this.checkForIntegration(workspaceId);
        }
      },
    );

    // Also check when the extension is activated
    const initialWorkspaceId = await getWorkspaceId();
    if (initialWorkspaceId) {
      this.checkForIntegration(initialWorkspaceId).catch((error) => {
        console.error(
          '[ToolbarIntegrationNotificator] Error checking for integration on initial load:',
          error,
        );
      });
    }

    this.disposables.push(workspaceListener);
  }

  public dispose() {
    console.log('[ToolbarIntegrationNotificator] Disposing...');
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  /**
   * Checks if the toolbar needs an update and shows a notification if necessary
   * @param workspaceId The unique identifier of the current workspace
   */
  public async checkForIntegration(workspaceId: string): Promise<void> {
    const envInfo = await EnvironmentInfo.getInstance();

    const isWebAppWorkspace = envInfo.isWebAppWorkspace;
    const isToolbarInstalled = envInfo.getToolbarInstalled();

    const shouldRecommend = isWebAppWorkspace && !isToolbarInstalled;

    if (!shouldRecommend) {
      return;
    }

    const storageKey = `toolbar_integration_recommendation_${workspaceId}`;
    const hasAlreadyNotified = await this.storage.get<boolean>(storageKey);

    // If we've already notified about this version, don't show again
    if (hasAlreadyNotified) {
      return;
    }

    this.showIntegrationNotification(storageKey, workspaceId);
  }

  private isGettingStartedPanelOpen(): boolean {
    for (const tabGroup of vscode.window.tabGroups.all) {
      for (const tab of tabGroup.tabs) {
        const input = tab.input;
        if (
          input instanceof vscode.TabInputWebview &&
          input.viewType === 'stagewiseGettingStarted'
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private async showIntegrationNotification(
    storageKey: string,
    workspaceId: string,
  ): Promise<void> {
    if (this.isGettingStartedPanelOpen()) {
      console.log(
        '[ToolbarIntegrationNotificator] Getting started panel is open, skipping notification.',
      );
      return;
    }
    console.log('Showing integration notification');
    const message = `We recommend setting up stagewise in this project in order to make changes with our toolbar right in your web app!`;

    vscode.window
      .showInformationMessage(message, 'Enable stagewise', 'Ignore')
      .then(async (result) => {
        if (result === 'Enable stagewise') {
          trackEvent(EventName.TOOLBAR_AUTO_SETUP_STARTED);
          await setupToolbar();
          return 'Enable stagewise';
        } else if (result === 'Ignore') {
          trackEvent(EventName.TOOLBAR_UPDATE_NOTIFICATION_IGNORED);
          await this.storage.set<boolean>(storageKey, true);
          return 'Ignore';
        } else {
          trackEvent(EventName.TOOLBAR_INTEGRATION_NOTIFICATION_DISMISSED);
          return 'Dismissed';
        }
      });
    trackEvent(EventName.SHOW_TOOLBAR_UPDATE_NOTIFICATION);
  }
}
