import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { McpServer } from '@agentclientprotocol/sdk';
import type { Logger } from '@/services/logger';

const MAX_REQUEST_BYTES = 256 * 1024;

export class StagewiseMcpBridge {
  private server: Server | null = null;
  private config: McpServer | null = null;
  private readonly token = randomBytes(32).toString('hex');

  public constructor(
    private readonly scriptPath: string,
    private readonly handleToolCall: (
      input: unknown,
      signal: AbortSignal,
    ) => Promise<unknown>,
    private readonly logger: Pick<Logger, 'warn'>,
  ) {}

  public async start(nodeExecutable: string): Promise<McpServer> {
    if (this.config) return this.config;

    const server = createServer((request, response) => {
      const controller = new AbortController();
      request.once('aborted', () => controller.abort());
      response.once('close', () => {
        if (!response.writableEnded) controller.abort();
      });
      void this.handleRequest(request, controller.signal)
        .then((result) => {
          if (response.destroyed) return;
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify(result));
        })
        .catch((error) => {
          this.logger.warn('[Stagewise MCP] Tool callback failed', { error });
          if (response.destroyed) return;
          response.writeHead(400, { 'content-type': 'text/plain' });
          response.end(error instanceof Error ? error.message : String(error));
        });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.server = server;
    const { port } = server.address() as AddressInfo;
    this.config = {
      name: 'stagewise',
      command: nodeExecutable,
      args: [this.scriptPath],
      env: [
        {
          name: 'STAGEWISE_MCP_CALLBACK_URL',
          value: `http://127.0.0.1:${port}/tools/request-user-input`,
        },
        { name: 'STAGEWISE_MCP_CALLBACK_TOKEN', value: this.token },
      ],
    };
    return this.config;
  }

  public async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.config = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handleRequest(
    request: IncomingMessage,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (
      request.method !== 'POST' ||
      request.url !== '/tools/request-user-input' ||
      !matchesToken(request.headers.authorization, this.token)
    ) {
      throw new Error('Unauthorized Stagewise MCP callback');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_REQUEST_BYTES) throw new Error('Request is too large');
      chunks.push(buffer);
    }
    return this.handleToolCall(
      JSON.parse(Buffer.concat(chunks).toString('utf8')),
      signal,
    );
  }
}

function matchesToken(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
