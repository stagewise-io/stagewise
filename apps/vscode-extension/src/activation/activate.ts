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
import { getCurrentWindowInfo } from '../utils/window-discovery';
import { getWindowShortId } from '../utils/window-discovery';

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
    // Find an available port
    const port = await findAvailablePort(DEFAULT_PORT);

    console.log(
      `[Stagewise] Starting extension on port ${port} for window: ${getWindowShortId()}`,
    );

    // Register MCP server with the actual port
    // updateCursorMcpConfig(port); // Disabled for now, since MCP tools are not available yet

    // Start the HTTP server with the same port
    const server = await startServer(port);
    const bridge = getExtensionBridge(server);

    console.log(`[Stagewise] Extension bridge ready on port ${port}`);

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

        console.log(
          `[Stagewise] Processing agent prompt for window: ${getWindowShortId()}`,
        );

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
    vscode.window.showErrorMessage(`Failed to start server: ${error}`);
    throw error;
  }

  // Register the setupToolbar command
  const setupToolbarCommand = vscode.commands.registerCommand(
    'stagewise.setupToolbar',
    setupToolbarHandler,
  );
  context.subscriptions.push(setupToolbarCommand);
}

export async function deactivate() {
  await stopServer();
}
