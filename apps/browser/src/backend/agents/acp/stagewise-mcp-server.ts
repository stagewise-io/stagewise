#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { askUserQuestionsToolInputSchemaFlat } from '../../../shared/karton-contracts/ui/agent/tools/ask-user-questions';

const callbackUrl = process.env.STAGEWISE_MCP_CALLBACK_URL;
const callbackToken = process.env.STAGEWISE_MCP_CALLBACK_TOKEN;

if (!callbackUrl || !callbackToken) {
  throw new Error('Stagewise MCP callback configuration is missing.');
}

const server = new McpServer({ name: 'stagewise', version: '1.0.0' });

server.registerTool(
  'stagewise_request_user_input',
  {
    title: 'Ask the user',
    description:
      'Show a native Stagewise form and wait for the response. Use this only for structured product questions, never for command or tool approval. Invoke commands and tools directly because the host owns their approval UI. Keep forms short and never call it concurrently.',
    inputSchema: askUserQuestionsToolInputSchemaFlat,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (input) => {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${callbackToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `Stagewise callback failed (${response.status})`);
    }
    const result = JSON.parse(text);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
);

await server.connect(new StdioServerTransport());
