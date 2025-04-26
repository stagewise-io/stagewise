import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConsoleLogsTool } from "./tools.js";

export const SERVER_NAME = "stagewise-mcp-server";
export const SERVER_VERSION = "1.0.0";

export function createMcpServer() {
    const mcpServer = new McpServer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        description: "A Model Context Protocol server that enables AI agents to interact with and monitor the user's browser environment in real-time.",
        schema: {
            type: "object",
            properties: {
                logs: { type: "array", items: { type: "string" } },
            }
        }
    });

    registerConsoleLogsTool(mcpServer);

    return mcpServer;
}

// Export a default instance for convenience
export const mcpServer = createMcpServer();