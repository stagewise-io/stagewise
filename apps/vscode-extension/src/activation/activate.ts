import * as vscode from 'vscode';
import {
  startServer,
  stopServer,
  type ServerOptions,
} from '../http-server/server';
import { findAvailablePort } from '../utils/find-available-port';
import {
  getExtensionBridge,
  DEFAULT_PORT,
} from '@stagewise/extension-toolbar-srpc-contract';
import { setupToolbar } from './setup-toolbar';
import { getCurrentIDE } from 'src/utils/get-current-ide';
import { dispatchAgentCall } from 'src/utils/dispatch-agent-call';
import { getCurrentWindowInfo } from '../utils/window-discovery';
import {
  trackEvent,
  shutdownAnalytics,
  trackTelemetryStateChange,
} from '../utils/analytics';
import { CertificateManager } from '../utils/certificate-manager';
import {
  registerCertificateCommands,
  showHttpsSetupGuidance,
} from '../commands/certificate-commands';

// Diagnostic collection specifically for our fake prompt
const fakeDiagCollection =
  vscode.languages.createDiagnosticCollection('stagewise');

// Dummy handler for the setupToolbar command
async function setupToolbarHandler() {
  await setupToolbar();
}

export async function activate(context: vscode.ExtensionContext) {
  const ide = getCurrentIDE();
  if (ide === 'UNKNOWN') {
    vscode.window.showInformationMessage(
      'stagewise does not work for your current IDE.',
    );
    return;
  }
  context.subscriptions.push(fakeDiagCollection); // Dispose on deactivation

  // Register certificate management commands
  await registerCertificateCommands(context);

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
    await trackEvent('extension_activated', {
      ide,
    });

    // Find an available port
    const port = await findAvailablePort(DEFAULT_PORT);

    // Check HTTPS configuration
    const config = vscode.workspace.getConfiguration('stagewise');
    const enableHttps = config.get<boolean>('server.enableHttps', false);

    let serverOptions: ServerOptions = { useHttps: false };

    if (enableHttps) {
      console.log('[Stagewise] HTTPS is enabled, setting up certificates...');
      const certManager = new CertificateManager(context);
      try {
        const certificates = await certManager.ensureValidCertificates();
        console.log('[Stagewise] Certificates obtained successfully');
        serverOptions = { useHttps: true, certificates };
        await showHttpsSetupGuidance();
        console.log('[Stagewise] HTTPS setup completed');
      } catch (error) {
        console.error('[Stagewise] Certificate setup failed:', error);
        vscode.window.showErrorMessage(
          `Failed to setup HTTPS certificates: ${error}. Falling back to HTTP.`,
        );
      }
    } else {
      console.log('[Stagewise] HTTPS is disabled, using HTTP');
    }

    // Register MCP server with the actual port
    // updateCursorMcpConfig(port); // Disabled for now, since MCP tools are not available yet

    // Start the server with the configured options
    console.log(
      `[Stagewise] Starting server on port ${port} with HTTPS: ${serverOptions.useHttps}`,
    );
    const server = await startServer(port, serverOptions);
    console.log(`[Stagewise] Server started successfully`);
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
      https: serverOptions.useHttps,
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
