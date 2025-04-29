import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
// TODO: This is mocked, will be replaced with dynamic tool registration via sRPC from the toolbar
// Types and functions will be defined in @stagewise/extension-toolbar-srpc-contract/src/contract.ts

export async function registerConsoleLogsTool(server: McpServer) {
  return server.tool(
    'get-console-logs',
    'Get the console logs',
    {
      request: z.object({
        amount: z.number().optional(),
      }),
    },
    async ({ request }) => {
      const logs: string[] = [];
      return {
        content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }],
      };
    },
  );
}

// TOOD: Use them for dynamic tool registration later
// Types for tool registration
export type ToolRequestSchema<T extends z.ZodType> = {
  request: T;
};

export type ToolResponse = {
  content: Array<{
    type: string;
    text: string;
  }>;
};

export type ToolHandler<T extends z.ZodType> = (
  params: z.infer<T>,
) => Promise<ToolResponse>;

export type ToolRegistration<T extends z.ZodType> = {
  name: string;
  description: string;
  schema: ToolRequestSchema<T>;
  handler: ToolHandler<T>;
};

// This type can be used by other components to declare new tools
export type ToolDeclaration<T extends z.ZodType> = {
  name: string;
  description: string;
  schema: T;
  handler: ToolHandler<T>;
};
