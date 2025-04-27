import type { RequestHandler } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { mcpServer } from '../../mcp/server';
import { addTransport, removeTransport, getTransport } from '../transport';

export const handleSse: RequestHandler = async (req, res) => {
  const transport = new SSEServerTransport('/sse-messages', res);
  addTransport('sse', transport.sessionId, transport);

  res.on('close', () => removeTransport('sse', transport.sessionId));

  await mcpServer.connect(transport);
};

export const handleSsePost: RequestHandler = async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = getTransport('sse', sessionId);

  if (!transport || !('handlePostMessage' in transport)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'No transport found for sessionId',
      },
      id: null,
    });
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
};
