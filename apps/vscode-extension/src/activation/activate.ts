import * as vscode from 'vscode';
import { startServer, stopServer } from '../http-server/server';
import { findAvailablePort } from '../utils/find-available-port';
import {
  getExtensionBridge,
  DEFAULT_PORT,
} from '@stagewise/extension-toolbar-srpc-contract';
import { setupToolbar } from './setup-toolbar';
import { getCurrentIDE } from 'src/utils/get-current-ide';
import { dispatchAgentCall } from 'src/utils/dispatch-agent-call';
import { trackEvent, shutdownAnalytics } from '../utils/analytics';

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

  try {
    // Track extension activation
    await trackEvent('extension_activated', {
      ide,
    });

    // Find an available port
    const port = await findAvailablePort(DEFAULT_PORT);

    // Register MCP server with the actual port
    // updateCursorMcpConfig(port); // Disabled for now, since MCP tools are not available yet

    // Start the HTTP server with the same port
    const server = await startServer(port);
    const bridge = getExtensionBridge(server);

    bridge.register({
      triggerAgentPrompt: async (request, sendUpdate) => {
        await trackEvent('agent_prompt_triggered');
        await dispatchAgentCall(request);
        sendUpdate.sendUpdate({ updateText: 'Called the agent' });

        return { result: { success: true } };
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
