import * as vscode from 'vscode';
import { startServer, stopServer, DEFAULT_PORT } from '../http-server/server';
import { updateCursorMcpConfig } from './register-mcp-server';
import { findAvailablePort } from '../utils/find-available-port';
import { callCursorAgent } from '../utils/call-cursor-agent';
import { getExtensionBridge } from '@stagewise/extension-toolbar-srpc-contract';
// Diagnostic collection specifically for our fake prompt
const fakeDiagCollection = vscode.languages.createDiagnosticCollection(
  'customPromptInjector',
);

export async function activate(context: vscode.ExtensionContext) {
  const isCursorIDE = vscode.env.appName.toLowerCase().includes('cursor');
  if (!isCursorIDE) {
    vscode.window.showInformationMessage(
      'For now, this extension is designed to work only in Cursor IDE. Please use Cursor to run this extension.',
    );
    return;
  }

  context.subscriptions.push(fakeDiagCollection); // Dispose on deactivation

  try {
    // Find an available port
    const port = await findAvailablePort(DEFAULT_PORT);

    // Register MCP server with the actual port
    updateCursorMcpConfig(port);

    // Start the HTTP server with the same port
    const server = await startServer(port);
    const bridge = getExtensionBridge(server);
    console.error('Bridge started', bridge);

    bridge.register({
      triggerAgentPrompt: async (request, sendUpdate) => {
        await callCursorAgent(request.prompt);
        sendUpdate({ updateText: 'Called the agent' });

        return { result: { success: true } };
      },
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to start server: ${error}`);
    throw error;
  }
}

export async function deactivate() {
  await stopServer();
}
