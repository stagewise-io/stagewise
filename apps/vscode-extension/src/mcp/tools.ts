import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import { getConsoleLogsData } from "../toolbar-websocket/handlers/console-logs";

export async function registerConsoleLogsTool(server: McpServer) {
    return server.tool("get-console-logs", "Get the console logs", {
        request: z.object({
            amount: z.number().optional()
        })
    }, async ({request}) => {
        const logs = getConsoleLogsData(request.amount);
        return {
            content: [{type: "text", text: JSON.stringify(logs, null, 2)}],
        };
    });
}