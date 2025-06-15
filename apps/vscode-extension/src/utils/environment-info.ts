import * as vscode from 'vscode';
import { compareVersions as compareVersionsUtil } from './lock-file-parsers/version-comparator';
import { RegistryService } from './registry-service';
import { WorkspaceService } from './workspace-service';
import { trackEvent, EventName } from './analytics';

export class EnvironmentInfo {
  private static instance: EnvironmentInfo;
  private static initializationPromise: Promise<void> | null = null;
  private toolbarInstalled = false;
  private toolbarInstalledVersion: string | null = null;
  private latestToolbarVersion: string | null = null;
  private latestExtensionVersion: string | null = null;
  private workspaceLoaded = false;
  private toolbarInstallations: Array<{ version: string; path: string }> = [];
  private webAppWorkspace = false;
  private readonly workspaceService: WorkspaceService;
  private readonly registryService: RegistryService;

  private constructor() {
    this.workspaceService = new WorkspaceService();
    this.registryService = new RegistryService();
    // Set up workspace change listeners
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.refreshState()
        .then(() => {
          if (this.webAppWorkspace) {
            trackEvent(EventName.OPENED_WEB_APP_WORKSPACE);
          }
        })
        .catch((error) => {
          console.error('Error refreshing environment state:', error);
        });
    });
  }

  public static async getInstance(): Promise<EnvironmentInfo> {
    try {
      if (!EnvironmentInfo.instance) {
        EnvironmentInfo.instance = new EnvironmentInfo();
        EnvironmentInfo.initializationPromise =
          EnvironmentInfo.instance.initialize();
      }

      // Wait for initialization to complete before returning the instance
      await EnvironmentInfo.initializationPromise;
      return EnvironmentInfo.instance;
    } catch (error) {
      console.error('Error getting EnvironmentInfo instance:', error);
      // Return a new instance even if initialization failed
      return EnvironmentInfo.instance || new EnvironmentInfo();
    }
  }

  private async initialize() {
    try {
      await this.refreshState();
      // Output all collected information to the console logs
      console.log('[EnvironmentInfo] Initialized:', {
        toolbarInstalled: this.toolbarInstalled,
        toolbarInstalledVersion: this.toolbarInstalledVersion,
        latestToolbarVersion: this.latestToolbarVersion,
        latestExtensionVersion: this.latestExtensionVersion,
        webAppWorkspace: this.webAppWorkspace,
      });

      if (this.webAppWorkspace) {
        trackEvent(EventName.OPENED_WEB_APP_WORKSPACE);
      }
    } catch (error) {
      console.error('Error initializing EnvironmentInfo:', error);
    }
  }

  private async refreshState() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    this.workspaceLoaded = !!workspaceFolders;
    if (!this.workspaceLoaded) {
      this.toolbarInstalled = false;
      this.toolbarInstalledVersion = null;
      this.toolbarInstallations = [];
      this.webAppWorkspace = false;
      console.log('[EnvironmentInfo] No workspace loaded');
      return;
    }

    const [toolbarInstallations, isWebApp, latestToolbar, latestExtension] =
      await Promise.all([
        this.workspaceService.getToolbarInstallations(),
        this.workspaceService.isWebAppWorkspace(),
        this.registryService.getLatestToolbarVersion(),
        this.registryService.getLatestExtensionVersion(),
      ]);

    this.toolbarInstallations = toolbarInstallations;
    this.toolbarInstalled = this.toolbarInstallations.length > 0;
    this.toolbarInstalledVersion = this.getOldestToolbarVersion(
      this.toolbarInstallations,
    );
    this.webAppWorkspace = isWebApp;
    this.latestToolbarVersion = latestToolbar;
    this.latestExtensionVersion = latestExtension;
  }

  private getOldestToolbarVersion(
    installations: Array<{ version: string; path: string }>,
  ): string | null {
    if (installations.length === 0) {
      return null;
    }

    return installations.reduce((oldest, current) => {
      if (!oldest?.version) {
        return current;
      }
      return this.compareVersions(current.version, oldest.version) < 0
        ? current
        : oldest;
    }).version;
  }

  public getExtensionVersion(): string {
    try {
      const extension = vscode.extensions.getExtension(
        'stagewise.stagewise-vscode-extension',
      );
      if (!extension) {
        console.warn('Stagewise extension not found');
        return 'unknown';
      }

      const version = extension.packageJSON?.version;
      if (!version) {
        console.warn('Extension version not found in package.json');
        return 'unknown';
      }

      return version;
    } catch (error) {
      console.error('Error getting extension version:', error);
      return 'unknown';
    }
  }

  public getToolbarInstalled(): boolean {
    return this.toolbarInstalled;
  }

  public getToolbarInstalledVersion(): string | null {
    return this.toolbarInstalledVersion;
  }

  public getLatestAvailableToolbarVersion(): string | null {
    return this.latestToolbarVersion;
  }

  public getWorkspaceLoaded(): boolean {
    return this.workspaceLoaded;
  }

  public getToolbarInstallations(): Array<{ version: string; path: string }> {
    return [...this.toolbarInstallations];
  }

  public getLatestAvailableExtensionVersion(): string | null {
    return this.latestExtensionVersion;
  }

  public get isWebAppWorkspace(): boolean {
    return this.webAppWorkspace;
  }

  private compareVersions(
    version1: string | undefined | null,
    version2: string | undefined | null,
  ): number {
    try {
      // Handle undefined, null, or empty strings
      if (!version1 || !version2) {
        return 0;
      }

      if (version1 === 'dev' || version2 === 'dev') {
        return 0;
      }

      return compareVersionsUtil(version1, version2);
    } catch (error) {
      console.error('Error comparing versions:', error);
      // Return 0 (equal) as a safe default
      return 0;
    }
  }
}
