import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export function updateCursorMcpConfig(port: number): void {
  const serverName = 'stagewise';
  const serverConfig = {
    url: `http://localhost:${port}/sse`,
    env: {}, // No environment variables needed for now
  };

  // Try to get the workspace root path first
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // Determine the config directory path
  let configDir: string;
  if (workspaceRoot) {
    // Use project's .cursor directory
    configDir = path.join(workspaceRoot, '.cursor');
  } else {
    // Fall back to home directory's .cursor
    configDir = path.join(os.homedir(), '.cursor');
  }

  // Create .cursor directory if it doesn't exist
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configPath = path.join(configDir, 'mcp.json');

  try {
    // Read existing config if it exists
    let config: {
      mcpServers: Record<string, { url: string; env: Record<string, string> }>;
    } = {
      mcpServers: {},
    };

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(content);
      // Ensure mcpServers exists
      if (!config.mcpServers) {
        config.mcpServers = {};
      }
    }

    // Update or add the server configuration
    config.mcpServers[serverName] = serverConfig;

    // Write back to file
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to register MCP server:', error);
    throw error;
  }
}
