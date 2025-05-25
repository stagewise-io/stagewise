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
import { registerMcpServers } from './register-mcp-server';
import { McpServerManager } from '../mcp/mcp-server-manager';
import { setExtensionBridge } from '../http-server/handlers/mcp-notifications';

// Diagnostic collection specifically for our fake prompt
const fakeDiagCollection =
  vscode.languages.createDiagnosticCollection('stagewise');

// Global MCP server manager instance
let mcpServerManager: McpServerManager | undefined;

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

  // Initialize MCP server manager
  mcpServerManager = new McpServerManager();
  context.subscriptions.push({
    dispose: () => mcpServerManager?.dispose(),
  });

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

    // Set the bridge for MCP notifications
    setExtensionBridge(bridge);

    console.log(`[Stagewise] Extension bridge ready on port ${port}`);

    bridge.register({
      getSessionInfo: async () => {
        return getCurrentWindowInfo(port);
      },
      registerMCP: async (request, sendUpdate) => {
        try {
          const source = request.source || 'unknown';
          sendUpdate.sendUpdate({
            updateText: `Registering MCP servers from ${source}...`,
          });

          // First, register the MCP servers with the IDE configuration
          await registerMcpServers(request.servers);

          // Then, start the MCP servers using our manager
          if (mcpServerManager) {
            for (const server of request.servers) {
              try {
                sendUpdate.sendUpdate({
                  updateText: `Starting MCP server: ${server.name}...`,
                });
                await mcpServerManager.startServer(server.name, server.config);
              } catch (error) {
                const errorMessage = `Failed to start MCP server ${server.name}: ${error}`;
                console.error(errorMessage);
                sendUpdate.sendUpdate({ updateText: errorMessage });
                // Continue with other servers even if one fails
              }
            }
          }

          const successMessage = `Successfully registered ${request.servers.length} MCP server(s) from ${source}`;
          sendUpdate.sendUpdate({ updateText: successMessage });

          return {
            result: {
              success: true,
              output: successMessage,
            },
          };
        } catch (error) {
          const errorMessage = `Failed to register MCP servers: ${error}`;
          console.error(errorMessage);
          sendUpdate.sendUpdate({ updateText: errorMessage });

          return {
            result: {
              success: false,
              error: errorMessage,
            },
          };
        }
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
          updateText: 'Calling the agent...',
        });

        return {
          sessionId: vscode.env.sessionId,
          result: { success: true },
        };
      },
    });

    console.log(`Stagewise extension activated successfully on port ${port}`);
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

  // Register MCP server status command
  const mcpStatusCommand = vscode.commands.registerCommand(
    'stagewise.mcpStatus',
    () => {
      if (mcpServerManager) {
        const servers = mcpServerManager.getServerStatuses();
        if (servers.length === 0) {
          vscode.window.showInformationMessage('No MCP servers registered');
        } else {
          const statusText = servers
            .map(
              (s) =>
                `${s.name}: ${s.status}${s.lastError ? ` (${s.lastError})` : ''}`,
            )
            .join('\n');
          vscode.window.showInformationMessage(
            `MCP Server Status:\n${statusText}`,
          );
        }
      }
    },
  );
  context.subscriptions.push(mcpStatusCommand);
}

export async function deactivate() {
  // Stop MCP servers first
  if (mcpServerManager) {
    await mcpServerManager.stopAllServers();
  }

  // Then stop the HTTP server
  await stopServer();
}
