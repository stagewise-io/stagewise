import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLogsDir } from '@/utils/paths';

/** Max request body size: 64 KB */
const MAX_BODY_BYTES = 64 * 1024;
/** Max log file size: 2 MB */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** Buffer flush interval in ms */
const FLUSH_INTERVAL_MS = 500;
/** Max buffered entries per channel before eager flush */
const FLUSH_ENTRY_THRESHOLD = 50;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const CHANNEL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface BufferedEntry {
  ts: number;
  level: string;
  source: string | undefined;
  data: unknown;
}

export class LogIngestService {
  private server: http.Server;
  private token: string;
  private port = 0;
  private buffers = new Map<string, BufferedEntry[]>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  private constructor() {
    this.token = randomUUID();
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  static async create(): Promise<LogIngestService> {
    const service = new LogIngestService();
    await service.start();
    return service;
  }

  getPort(): number {
    return this.port;
  }

  getToken(): string {
    return this.token;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        this.startFlushLoop();
        resolve();
      });
      this.server.once('error', reject);
    });
  }

  async teardown(): Promise<void> {
    this.closed = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushAll();
    return new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
  }

  // ---------------------------------------------------------------------------
  // Request handling
  // ---------------------------------------------------------------------------

  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      this.respond(res, 404, { error: 'Not found' });
      return;
    }

    // Parse URL
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Expected: /ingest/:channel
    if (pathParts.length !== 2 || pathParts[0] !== 'ingest') {
      this.respond(res, 404, { error: 'Not found' });
      return;
    }

    const channel = pathParts[1]!;

    // Validate token
    const token = url.searchParams.get('token');
    if (token !== this.token) {
      this.respond(res, 403, { error: 'Invalid token' });
      return;
    }

    // Validate channel name
    if (!CHANNEL_NAME_RE.test(channel)) {
      this.respond(res, 400, {
        error:
          'Invalid channel name. Must be kebab-case (lowercase alphanumeric with hyphens).',
      });
      return;
    }

    // Check channel file exists
    const filePath = path.join(getLogsDir(), `${channel}.jsonl`);
    if (!existsSync(filePath)) {
      this.respond(res, 404, {
        error: `Log channel "${channel}" does not exist. Create it first.`,
      });
      return;
    }

    // Check file size
    try {
      const stat = statSync(filePath);
      if (stat.size >= MAX_FILE_BYTES) {
        this.respond(res, 409, {
          error: `Log file for "${channel}" has reached the 2 MB limit. Read, analyze, and truncate before continuing.`,
        });
        return;
      }
    } catch {
      // stat failed — file may have been deleted between checks
      this.respond(res, 404, { error: `Log channel "${channel}" not found.` });
      return;
    }

    // Read body
    this.readBody(req, (err, body) => {
      if (err) {
        if (err === 'too_large') {
          this.respond(res, 413, {
            error: 'Request body exceeds 64 KB limit.',
          });
        } else {
          this.respond(res, 400, { error: 'Failed to read request body.' });
        }
        return;
      }

      // Parse JSON
      let parsed: { level?: string; source?: string; data?: unknown };
      try {
        parsed = JSON.parse(body!);
      } catch {
        this.respond(res, 400, { error: 'Invalid JSON body.' });
        return;
      }

      if (typeof parsed !== 'object' || parsed === null) {
        this.respond(res, 400, { error: 'Body must be a JSON object.' });
        return;
      }

      const entry: BufferedEntry = {
        ts: Date.now(),
        level: typeof parsed.level === 'string' ? parsed.level : 'log',
        source: typeof parsed.source === 'string' ? parsed.source : undefined,
        data: parsed.data,
      };

      // Push to buffer
      let buf = this.buffers.get(channel);
      if (!buf) {
        buf = [];
        this.buffers.set(channel, buf);
      }
      buf.push(entry);

      // Eager flush if threshold reached
      if (buf.length >= FLUSH_ENTRY_THRESHOLD) {
        void this.flushChannel(channel);
      }

      this.respond(res, 202, { ok: true });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private respond(
    res: http.ServerResponse,
    status: number,
    body: Record<string, unknown>,
  ): void {
    res.writeHead(status, {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(body));
  }

  private readBody(
    req: http.IncomingMessage,
    cb: (err: string | null, body: string | null) => void,
  ): void {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let fired = false;

    const done = (err: string | null, body: string | null) => {
      if (fired) return;
      fired = true;
      cb(err, body);
    };

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_BYTES) {
        req.destroy();
        done('too_large', null);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      done(null, Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', () => {
      done('read_error', null);
    });
  }

  // ---------------------------------------------------------------------------
  // Write buffering
  // ---------------------------------------------------------------------------

  private startFlushLoop(): void {
    this.flushTimer = setInterval(() => {
      void this.flushAll();
    }, FLUSH_INTERVAL_MS);
  }

  private async flushAll(): Promise<void> {
    const channels = [...this.buffers.keys()];
    await Promise.all(channels.map((ch) => this.flushChannel(ch)));
  }

  private async flushChannel(channel: string): Promise<void> {
    const buf = this.buffers.get(channel);
    if (!buf || buf.length === 0) return;

    // Swap out the buffer atomically
    this.buffers.set(channel, []);

    const lines = `${buf.map((e) => JSON.stringify(e)).join('\n')}\n`;
    const filePath = path.join(getLogsDir(), `${channel}.jsonl`);

    try {
      await fs.appendFile(filePath, lines, 'utf-8');
    } catch {
      // File may have been deleted — discard silently
    }
  }
}
