import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getCurrentIDE } from 'src/utils/get-current-ide';

/**
 * MCP Server configuration that follows the official MCP client configuration format
 * This aligns with Claude Desktop and other MCP clients
 */
export interface McpServerConfig {
  /** Command to run (for stdio transport) */
  command?: string;
  /** Arguments for the command (for stdio transport) */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Path to environment file */
  envFile?: string;
  /** URL for SSE/HTTP transport */
  url?: string;
  /** Headers for HTTP requests */
  headers?: Record<string, string>;
  /** Additional server-specific settings */
  [key: string]: any;
}

export interface McpServerConfigSse extends McpServerConfig {
  url: string;
  headers?: Record<string, string>;
}

export interface McpServerConfigStdio extends McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  envFile?: string;
}

interface NamedMcpServer {
  name: string;
  config: McpServerConfig;
}

/**
 * Converts our McpServerConfig to the format expected by different IDEs
 */
function convertToIdeFormat(
  config: McpServerConfig,
): McpServerConfigStdio | McpServerConfigSse {
  // Determine transport type based on available properties
  if (config.command) {
    // stdio transport
    return {
      command: config.command,
      args: config.args || [],
      env: config.env || {},
      ...(config.envFile && { envFile: config.envFile }),
    };
  } else if (config.url) {
    // SSE/HTTP transport
    return {
      url: config.url,
      ...(config.headers && { headers: config.headers }),
    };
  } else {
    throw new Error(
      'Invalid MCP server configuration: must have either command or url',
    );
  }
}

/**
 * Registers MCP servers for VS Code using workspace configuration
 */
async function registerMcpServersVSCode(
  servers: Record<string, McpServerConfigStdio | McpServerConfigSse>,
): Promise<void> {
  try {
    const cfg = vscode.workspace.getConfiguration('mcp');
    await cfg.update('servers', servers, vscode.ConfigurationTarget.Workspace);
  } catch (error) {
    console.error('Failed to register MCP servers for VS Code:', error);
    throw error;
  }
}

/**
 * Registers MCP servers for Windsurf by writing to the config file
 */
async function registerMcpServersWindsurf(
  servers: Record<string, McpServerConfigStdio | McpServerConfigSse>,
): Promise<void> {
  try {
    const dir = path.join(os.homedir(), '.codeium', 'windsurf');
    fs.mkdirSync(dir, { recursive: true });

    const configPath = path.join(dir, 'mcp_config.json');
    const configContent = {
      mcpServers: servers,
    };

    fs.writeFileSync(
      configPath,
      JSON.stringify(configContent, null, 2),
      'utf8',
    );

    console.log(
      'Successfully registered MCP servers for Windsurf at:',
      configPath,
    );
  } catch (error) {
    console.error('Failed to register MCP servers for Windsurf:', error);
    throw error;
  }
}

/**
 * Registers MCP servers for Cursor by writing to workspace .cursor/mcp.json
 */
async function registerMcpServersCursor(
  servers: Record<string, McpServerConfigStdio | McpServerConfigSse>,
): Promise<void> {
  try {
    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsFolder) {
      const message = 'No workspace folder; cannot write Cursor MCP config.';
      vscode.window.showWarningMessage(message);
      throw new Error(message);
    }

    const dir = path.join(wsFolder, '.cursor');
    fs.mkdirSync(dir, { recursive: true });

    const configPath = path.join(dir, 'mcp.json');
    const configContent = {
      mcpServers: servers,
    };

    fs.writeFileSync(
      configPath,
      JSON.stringify(configContent, null, 2),
      'utf8',
    );
  } catch (error) {
    console.error('Failed to register MCP servers for Cursor:', error);
    throw error;
  }
}

/**
 * Determines the current IDE and returns appropriate registration function
 */
function getIdeMcpRegistrationFunction(): (
  servers: Record<string, McpServerConfigStdio | McpServerConfigSse>,
) => Promise<void> {
  const ide = getCurrentIDE();
  switch (ide) {
    case 'CURSOR':
      return registerMcpServersCursor;
    case 'WINDSURF':
      return registerMcpServersWindsurf;
    case 'VSCODE':
      return registerMcpServersVSCode;
    default:
      throw new Error(`Unsupported IDE: ${ide}`);
  }
}

/**
 * Registers MCP servers for the current host (VS Code, Windsurf, Cursor)
 * Enhanced version with better error handling and IDE-specific functions
 */
export async function registerMcpServers(
  serversArray: NamedMcpServer[],
): Promise<void> {
  if (!serversArray || serversArray.length === 0) return;

  try {
    // Convert configurations to IDE-specific format
    const servers = serversArray.reduce<
      Record<string, McpServerConfigStdio | McpServerConfigSse>
    >((map, srv) => {
      try {
        map[srv.name] = convertToIdeFormat(srv.config);
        return map;
      } catch (error) {
        console.error(
          `Failed to convert MCP server config for ${srv.name}:`,
          error,
        );
        throw error;
      }
    }, {});

    const registrationFunction = getIdeMcpRegistrationFunction();
    await registrationFunction(servers);
  } catch (error) {
    const message = `Failed to register MCP servers: ${error}`;
    console.error(message);
    vscode.window.showErrorMessage(message);
    throw error;
  }
}
