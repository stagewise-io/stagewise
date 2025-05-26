import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from '../constants';

export function createMcpServer() {
  const mcpServer = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    description:
      "A Model Context Protocol server that enables AI agents to interact with and monitor the user's browser environment in real-time.",
    schema: {
      type: 'object',
      properties: {
        logs: { type: 'array', items: { type: 'string' } },
      },
    },
  });

  // TODO: Add tools here
  // registerConsoleLogsTool(mcpServer);

  return mcpServer;
}

// Export a default instance for convenience
export const mcpServer = createMcpServer();
