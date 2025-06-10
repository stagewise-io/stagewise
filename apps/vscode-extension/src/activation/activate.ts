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
import {
  trackEvent,
  shutdownAnalytics,
  trackTelemetryStateChange,
} from '../utils/analytics';
import {
  createGettingStartedPanel,
  shouldShowGettingStarted,
} from '../webviews/getting-started';
import { ExtensionStorage } from '../data-storage';
import { VScodeContext } from '../utils/vscode-context';
import { EnvironmentInfo } from 'src/utils/environment-info';
import { ToolbarUpdateNotificator } from 'src/utils/toolbar-update-notificator';

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
  // Initialize VScodeContext first
  await VScodeContext.initialize(context);

  const ide = getCurrentIDE();
  if (ide === 'UNKNOWN') {
    vscode.window.showInformationMessage(
      'stagewise does not work for your current IDE.',
    );
    return;
  }
  context.subscriptions.push(fakeDiagCollection); // Dispose on deactivation
  context.subscriptions.push(outputChannel); // Dispose output channel on deactivation

  const storage = new ExtensionStorage(context);

  await EnvironmentInfo.getInstance();
  // Initialize the toolbar update notificator
  const updateNotificator = new ToolbarUpdateNotificator(storage);
  context.subscriptions.push(updateNotificator); // This will call dispose() when the extension is deactivated

  // Add configuration change listener to track telemetry setting changes
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(
    async (e) => {
      if (e.affectsConfiguration('stagewise.telemetry.enabled')) {
        const config = vscode.workspace.getConfiguration('stagewise');
        const telemetryEnabled = config.get<boolean>('telemetry.enabled', true);

        // Track the telemetry state change using the dedicated function
        await trackTelemetryStateChange(telemetryEnabled);
      }
    },
  );

  context.subscriptions.push(configChangeListener);

  try {
    // Track extension activation
    await trackEvent('extension_activated', { ide });

    // Find an available port
    const port = await findAvailablePort(DEFAULT_PORT);

    // Start the HTTP server with the same port
    const server = await startServer(port);
    const bridge = getExtensionBridge(server);

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
        await trackEvent('agent_prompt_triggered');

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

    // Track successful server start
    await trackEvent('server_started', {
      port,
    });
  } catch (error) {
    // Track activation error
    await trackEvent('activation_error', {
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
        await trackEvent('toolbar_auto_setup_started');
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
        await trackEvent('getting_started_panel_manual_show');
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

  if (await shouldShowGettingStarted(storage)) {
    // Show getting started panel for first-time users
    await trackEvent('getting_started_panel_shown');
    createGettingStartedPanel(context, storage, setupToolbarHandler);
  }
}

export async function deactivate() {
  try {
    // Track extension deactivation before shutting down analytics
    await trackEvent('extension_deactivated');
    await stopServer();
    await shutdownAnalytics();
  } catch (error) {
    // Log error but don't throw during deactivation
    console.error(
      'Error during extension deactivation:',
      error instanceof Error ? error.message : String(error),
    );
  }
}
