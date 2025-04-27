import type { RequestHandler } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpServer } from '../../mcp/server';
import { addTransport, removeTransport, getTransport } from '../transport';

export const handleStreamableHttp: RequestHandler = async (req, res) => {
  const sessionId = req.query.sessionId as string;

  if (sessionId) {
    const transport = getTransport('streamable', sessionId);
    if (transport && 'handleRequest' in transport) {
      await transport.handleRequest(req, res);
      return;
    }
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'No transport found for sessionId',
      },
      id: null,
    });
  }

  const newSessionId = `streamable-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => newSessionId,
    onsessioninitialized: (sessionId) => {
      addTransport('streamable', sessionId, transport);
    },
  });

  addTransport('streamable', newSessionId, transport);

  res.on('close', () => removeTransport('streamable', newSessionId));

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res);
};
