import * as vscode from 'vscode';
import { startServer, stopServer } from '../http-server/server';
import { findAvailablePort } from '../utils/find-available-port';
import {
  getExtensionBridge,
  DEFAULT_PORT,
} from '@stagewise/extension-toolbar-srpc-contract';
import { setupToolbar } from '../auto-prompts/setup-toolbar';
import { getCurrentIDE } from 'src/utils/get-current-ide';
import { dispatchAgentCall } from 'src/utils/dispatch-agent-call';
import { getCurrentWindowInfo } from '../utils/window-discovery';
import { AnalyticsService, EventName } from '../utils/analytics-service';
import {
  createGettingStartedPanel,
  shouldShowGettingStarted,
} from '../webviews/getting-started';
import { StorageService } from '../utils/storage-service';
import { VScodeContext } from '../utils/vscode-context';
import { EnvironmentInfo } from 'src/utils/environment-info';
import { ToolbarUpdateNotificator } from 'src/utils/toolbar-update-notificator';
import { ToolbarIntegrationNotificator } from 'src/utils/toolbar-integration-notificator';
import { WorkspaceService } from 'src/utils/workspace-service';
import { RegistryService } from 'src/utils/registry-service';

// Diagnostic collection specifically for our fake prompt
const fakeDiagCollection =
  vscode.languages.createDiagnosticCollection('stagewise');

// Create output channel for stagewise
const outputChannel = vscode.window.createOutputChannel('stagewise');

// Dummy handler for the setupToolbar command
async function setupToolbarHandler() {
  await setupToolbar();
  await vscode.window.showInformationMessage(
    "The agent has been started to integrate stagewise into this project. Please follow the agent's instructions in the chat panel.",
    'OK',
  );
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('Activating stagewise extension');
  try {
    // initialize all services in the correct order
    VScodeContext.getInstance().initialize(context);
    StorageService.getInstance().initialize();

    const analyticsService = AnalyticsService.getInstance();
    analyticsService.initialize();

    WorkspaceService.getInstance();
    RegistryService.getInstance();
    EnvironmentInfo.getInstance().initialize();

    const integrationNotificator = ToolbarIntegrationNotificator.getInstance();
    integrationNotificator.initialize();
    context.subscriptions.push(integrationNotificator);

    const updateNotificator = ToolbarUpdateNotificator.getInstance();
    updateNotificator.initialize();
    context.subscriptions.push(updateNotificator);

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

    // Function to show getting started panel if needed
    const showGettingStartedIfNeeded = async () => {
      if (await shouldShowGettingStarted(storage)) {
        analyticsService.trackEvent(EventName.GETTING_STARTED_PANEL_SHOWN);
        createGettingStartedPanel(context, storage, setupToolbarHandler);
      }
    };

    if (vscode.workspace.workspaceFolders?.length) {
      // Show getting started panel on workspace load (activation)
      await showGettingStartedIfNeeded();
    }

    // Listen for workspace folder changes (workspace loaded)
    const workspaceFolderListener =
      vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        if (vscode.workspace.workspaceFolders?.length) {
          await showGettingStartedIfNeeded();
        }
      });
    context.subscriptions.push(workspaceFolderListener);

    try {
      // Track extension activation
      analyticsService.trackEvent(EventName.EXTENSION_ACTIVATED, { ide });

      // Find an available port
      const port = await findAvailablePort(DEFAULT_PORT);

      // Start the HTTP server with the same port
      const server = await startServer(port);
      const bridge = getExtensionBridge(server);

      server.on('connect', () => {
        console.log('Toolbar connected');
        analyticsService.trackEvent(EventName.TOOLBAR_CONNECTED);
      });

      bridge.register({
        getSessionInfo: async (request, sendUpdate) => {
          return getCurrentWindowInfo(port);
        },
        triggerAgentPrompt: async (request, sendUpdate) => {
          // If sessionId is provided, validate it matches this window
          // If no sessionId provided, accept the request (backward compatibility)
          if (request.sessionId && request.sessionId !== vscode.env.sessionId) {
            const error = `Session mismatch: Request for ${request.sessionId} but this window is ${vscode.env.sessionId}`;
            console.warn(`[Stagewise] ${error}`);
            return {
              sessionId: vscode.env.sessionId,
              result: {
                success: false,
                error: error,
                errorCode: 'session_mismatch',
              },
            };
          }
          analyticsService.trackEvent(EventName.AGENT_PROMPT_TRIGGERED);

          await dispatchAgentCall(request);
          sendUpdate.sendUpdate({
            sessionId: vscode.env.sessionId,
            updateText: 'Called the agent',
          });

          return {
            sessionId: vscode.env.sessionId,
            result: { success: true },
          };
        },
      });
    } catch (error) {
      // Track activation error
      analyticsService.trackEvent(EventName.ACTIVATION_ERROR, {
        error: error instanceof Error ? error.message : String(error),
      });
      vscode.window.showErrorMessage(`Failed to start server: ${error}`);
      throw error;
    }

    // Register the setupToolbar command
    const setupToolbarCommand = vscode.commands.registerCommand(
      'stagewise.setupToolbar',
      async () => {
        try {
          analyticsService.trackEvent(EventName.TOOLBAR_AUTO_SETUP_STARTED);
          await setupToolbarHandler();
        } catch (error) {
          console.error(
            'Error during toolbar setup:',
            error instanceof Error ? error.message : String(error),
          );
          throw error;
        }
      },
    );
    context.subscriptions.push(setupToolbarCommand);

    // Register the show getting started command
    const showGettingStartedCommand = vscode.commands.registerCommand(
      'stagewise.showGettingStarted',
      async () => {
        try {
          analyticsService.trackEvent(
            EventName.GETTING_STARTED_PANEL_MANUAL_SHOW,
          );
          createGettingStartedPanel(context, storage, setupToolbarHandler);
        } catch (error) {
          console.error(
            'Error showing getting started panel:',
            error instanceof Error ? error.message : String(error),
          );
          throw error;
        }
      },
    );
    context.subscriptions.push(showGettingStartedCommand);
  } catch (error) {
    console.error('Error during extension activation:', error);
  }
}

export async function deactivate() {
  try {
    // Track extension deactivation before shutting down analytics
    await stopServer();
    AnalyticsService.getInstance().shutdown();
  } catch (error) {
    // Log error but don't throw during deactivation
    console.error(
      'Error during extension deactivation:',
      error instanceof Error ? error.message : String(error),
    );
  }
}
