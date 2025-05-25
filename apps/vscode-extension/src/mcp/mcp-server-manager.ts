import * as vscode from 'vscode';
import * as cp from 'node:child_process';
import type { McpServerConfig } from 'src/activation/register-mcp-server';

export interface ManagedMcpServer {
  name: string;
  config: McpServerConfig;
  process?: cp.ChildProcess;
  status: 'starting' | 'running' | 'stopped' | 'error';
  pid?: number;
  startTime?: Date;
  lastError?: string;
}

/**
 * Manages MCP servers for the VS Code extension
 * Handles starting, stopping, and monitoring server processes
 */
export class McpServerManager {
  private servers = new Map<string, ManagedMcpServer>();
  private readonly outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel(
      'Stagewise MCP Servers',
    );
  }

  /**
   * Starts an MCP server with the given configuration
   */
  async startServer(name: string, config: McpServerConfig): Promise<void> {
    // Stop existing server if running
    await this.stopServer(name);

    const server: ManagedMcpServer = {
      name,
      config,
      status: 'starting',
      startTime: new Date(),
    };

    this.servers.set(name, server);
    this.outputChannel.appendLine(`Starting MCP server: ${name}`);

    try {
      // Determine server type based on configuration
      if (config.command) {
        await this.startStdioServer(server);
      } else if (config.url) {
        await this.startSseServer(server);
      } else {
        throw new Error(
          `Invalid MCP server configuration: must have either command or url`,
        );
      }

      server.status = 'running';
      this.outputChannel.appendLine(`MCP server ${name} started successfully`);
    } catch (error) {
      server.status = 'error';
      server.lastError = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `Failed to start MCP server ${name}: ${server.lastError}`,
      );
      throw error;
    }
  }

  /**
   * Stops an MCP server
   */
  async stopServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server) return;

    this.outputChannel.appendLine(`Stopping MCP server: ${name}`);

    if (server.process) {
      try {
        // Gracefully terminate the process
        server.process.kill('SIGTERM');

        // Wait for process to exit or force kill after 5 seconds
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            if (server.process && !server.process.killed) {
              server.process.kill('SIGKILL');
            }
            reject(new Error(`Process ${name} did not exit gracefully`));
          }, 5000);

          server.process!.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      } catch (error) {
        this.outputChannel.appendLine(
          `Force killed MCP server ${name}: ${error}`,
        );
      }
    }

    server.status = 'stopped';
    server.process = undefined;
    server.pid = undefined;
    this.outputChannel.appendLine(`MCP server ${name} stopped`);
  }

  /**
   * Stops all MCP servers
   */
  async stopAllServers(): Promise<void> {
    const stopPromises = Array.from(this.servers.keys()).map((name) =>
      this.stopServer(name),
    );
    await Promise.allSettled(stopPromises);
    this.servers.clear();
  }

  /**
   * Gets the status of all managed servers
   */
  getServerStatuses(): ManagedMcpServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Gets the status of a specific server
   */
  getServerStatus(name: string): ManagedMcpServer | undefined {
    return this.servers.get(name);
  }

  /**
   * Starts a stdio-based MCP server
   */
  private async startStdioServer(server: ManagedMcpServer): Promise<void> {
    const { config } = server;

    if (!config.command) {
      throw new Error('stdio MCP server requires a command');
    }

    // Prepare environment variables
    const processEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...(config.env || {}),
    };

    // Load environment file if specified
    if (config.envFile) {
      try {
        const envFileContent = await vscode.workspace.fs.readFile(
          vscode.Uri.file(config.envFile),
        );
        const envLines = envFileContent.toString().split('\n');
        for (const line of envLines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
              processEnv[key.trim()] = valueParts.join('=').trim();
            }
          }
        }
      } catch (error) {
        this.outputChannel.appendLine(
          `Warning: Could not load env file ${config.envFile}: ${error}`,
        );
      }
    }

    // Start the process
    const childProcess = cp.spawn(config.command, config.args || [], {
      env: processEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    server.process = childProcess;
    server.pid = childProcess.pid;

    // Handle process events
    childProcess.on('error', (error: Error) => {
      server.status = 'error';
      server.lastError = error.message;
      this.outputChannel.appendLine(
        `MCP server ${server.name} error: ${error.message}`,
      );
    });

    childProcess.on('exit', (code: number | null, signal: string | null) => {
      if (server.status !== 'stopped') {
        server.status = 'error';
        server.lastError = `Process exited with code ${code}, signal ${signal}`;
      }
      this.outputChannel.appendLine(
        `MCP server ${server.name} exited: code=${code}, signal=${signal}`,
      );
    });

    // Pipe output to our output channel
    childProcess.stdout?.on('data', (data) => {
      this.outputChannel.appendLine(
        `[${server.name}] ${data.toString().trim()}`,
      );
    });

    childProcess.stderr?.on('data', (data) => {
      this.outputChannel.appendLine(
        `[${server.name}] ERROR: ${data.toString().trim()}`,
      );
    });

    // Wait a bit to see if the process starts successfully
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (server.status === 'error') {
          reject(new Error(server.lastError || 'Unknown error'));
        } else {
          resolve();
        }
      }, 2000);

      childProcess.on('error', () => {
        clearTimeout(timeout);
        reject(new Error(server.lastError || 'Process failed to start'));
      });

      if (childProcess.pid) {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  /**
   * Starts an SSE-based MCP server (placeholder implementation)
   */
  private async startSseServer(server: ManagedMcpServer): Promise<void> {
    const { config } = server;

    if (!config.url) {
      throw new Error('SSE MCP server requires a URL');
    }

    // For SSE servers, we don't start a process but validate the URL
    try {
      // Basic URL validation and connectivity check
      const url = new URL(config.url);
      this.outputChannel.appendLine(
        `SSE MCP server ${server.name} configured for URL: ${url.toString()}`,
      );

      // Note: Actual SSE connection would be handled by the MCP SDK
      // This is just validation and setup
    } catch (error) {
      throw new Error(`Invalid SSE URL for server ${server.name}: ${error}`);
    }
  }

  /**
   * Disposes of the manager and cleans up resources
   */
  dispose(): void {
    this.stopAllServers();
    this.outputChannel.dispose();
  }
}
