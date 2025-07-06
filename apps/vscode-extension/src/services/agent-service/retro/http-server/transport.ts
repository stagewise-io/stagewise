import type { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

interface Transports {
  sse: Record<string, SSEServerTransport>;
  streamable: Record<string, StreamableHTTPServerTransport>;
}

const transports: Transports = {
  sse: {},
  streamable: {},
};

export const getTransport = (type: 'sse' | 'streamable', sessionId: string) =>
  transports[type][sessionId];

export const addTransport = (
  type: 'sse' | 'streamable',
  sessionId: string,
  transport: SSEServerTransport | StreamableHTTPServerTransport,
) => {
  transports[type][sessionId] = transport;
};

export const removeTransport = (
  type: 'sse' | 'streamable',
  sessionId: string,
) => {
  delete transports[type][sessionId];
};
