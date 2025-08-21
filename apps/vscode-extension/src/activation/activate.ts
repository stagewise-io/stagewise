import * as vscode from 'vscode';
import { removeOldToolbar } from '../auto-prompts/remove-old-toolbar';
import { getCurrentIDE } from 'src/utils/get-current-ide';
import { AnalyticsService, EventName } from 'src/services/analytics-service';
import {
  createTimeToUpgradePanel,
  shouldShowTimeToUpgrade,
} from '../webviews/time-to-upgrade';
import { StorageService } from 'src/services/storage-service';
import { VScodeContext } from 'src/services/vscode-context';
import { EnvironmentInfo } from 'src/services/environment-info';
import { WorkspaceService } from 'src/services/workspace-service';
import { PackageJsonScanner } from 'src/services/package-json-scanner';
import { AgentService as IDEChatAgentService } from 'src/services/agent-service';
import { AgentSelectorService } from 'src/services/agent-selector';
import {
  createGettingStartedPanel,
  shouldShowGettingStarted,
} from 'src/webviews/getting-started';

let ideAgentInitialized = false;

// Diagnostic collection specifically for our fake prompt
const fakeDiagCollection =
  vscode.languages.createDiagnosticCollection('stagewise');

// Create output channel for stagewise
const outputChannel = vscode.window.createOutputChannel('stagewise');

// Handler for the setupToolbar command
async function removeOldToolbarHandler() {
  await removeOldToolbar();
  await vscode.window.showInformationMessage(
    "The agent has been triggered to remove the old integration of stagewise. Please follow the agent's instructions in the chat panel.",
    'OK',
  );
}

// Helper functions for agent management
async function initializeIDEAgent() {
  if (ideAgentInitialized) {
    return; // Already initialized
  }
  const ideAgentService = IDEChatAgentService.getInstance();
  await ideAgentService.initialize();
  AgentSelectorService.getInstance().updateStatusbarText('Forward to IDE Chat');
  ideAgentInitialized = true;
}

async function shutdownIDEAgent() {
  if (!ideAgentInitialized) {
    return; // Not initialized
  }
  const ideAgentService = IDEChatAgentService.getInstance();
  await ideAgentService.shutdown();
  ideAgentInitialized = false;
}

export async function activate(context: vscode.ExtensionContext) {
  try {
    // Initialize all services in the correct order
    VScodeContext.getInstance().initialize(context);
    await StorageService.getInstance().initialize();

    const analyticsService = AnalyticsService.getInstance();
    analyticsService.initialize();

    WorkspaceService.getInstance();
    await EnvironmentInfo.getInstance().initialize();

    const agentSelectorService = AgentSelectorService.getInstance();
    await agentSelectorService.initialize();

    await initializeIDEAgent();

    agentSelectorService.onPreferredAgentChanged(async (agentName) => {
      if (agentName === 'ide-chat') {
        await shutdownIDEAgent();
        await initializeIDEAgent();
      }
    });

    const ide = getCurrentIDE();
    if (ide === 'UNKNOWN') {
      vscode.window.showInformationMessage(
        'stagewise does not work for your current IDE.',
      );
      return;
    }
    context.subscriptions.push(fakeDiagCollection); // Dispose on deactivation
    context.subscriptions.push(outputChannel); // Dispose output channel on deactivation

    const storage = StorageService.getInstance();

    // Add configuration change listener to track telemetry setting changes
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(
      async (e) => {
        if (e.affectsConfiguration('stagewise.telemetry.enabled')) {
          const config = vscode.workspace.getConfiguration('stagewise');
          const telemetryEnabled = config.get<boolean>(
            'telemetry.enabled',
            true,
          );

          // Track the telemetry state change using the dedicated function
          analyticsService.trackTelemetryStateChange(telemetryEnabled);
        }
      },
    );

    context.subscriptions.push(configChangeListener);

    if (await shouldShowGettingStarted(storage)) {
      analyticsService.trackEvent(EventName.GETTING_STARTED_PANEL_SHOWN);
      createGettingStartedPanel(context, storage);
    }

    // Function to show time to upgrade panel if needed
    const showTimeToUpgradePanel = async () => {
      if (await shouldShowTimeToUpgrade(storage)) {
        analyticsService.trackEvent(EventName.TIME_TO_UPGRADE_PANEL_SHOWN);
        createTimeToUpgradePanel(context, storage, removeOldToolbarHandler);
      }
    };

    if (vscode.workspace.workspaceFolders?.length) {
      // Check if old toolbar packages are installed
      const scanner = PackageJsonScanner.getInstance();
      const deprecatedPackages = await scanner.scanWorkspace();

      if (deprecatedPackages.length > 0) {
        await showTimeToUpgradePanel();
      }
    }

    // Listen for workspace folder changes (workspace loaded)
    const workspaceFolderListener =
      vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        if (vscode.workspace.workspaceFolders?.length) {
          // Check if old toolbar packages are installed
          const scanner = PackageJsonScanner.getInstance();
          const deprecatedPackages = await scanner.scanWorkspace();

          if (deprecatedPackages.length > 0) {
            await showTimeToUpgradePanel();
          }
        }
      });
    context.subscriptions.push(workspaceFolderListener);

    const setAgentCommand = vscode.commands.registerCommand(
      'stagewise.setAgent',
      async () => {
        await agentSelectorService.showAgentPicker();
      },
    );
    context.subscriptions.push(setAgentCommand);
  } catch (error) {
    console.error('Error during extension activation:', error);
  }
}

export async function deactivate(_context: vscode.ExtensionContext) {
  try {
    AnalyticsService.getInstance().shutdown();

    // Shutdown IDE agent if initialized
    if (ideAgentInitialized) {
      await shutdownIDEAgent();
    }
  } catch (error) {
    // Log error but don't throw during deactivation
    console.error(
      'Error during extension deactivation:',
      error instanceof Error ? error.message : String(error),
    );
  }
}
