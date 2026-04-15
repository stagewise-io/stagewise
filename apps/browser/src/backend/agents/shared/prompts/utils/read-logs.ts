import { createReadStream, existsSync } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface LogChannelSummary {
  filename: string;
  byteSize: number;
  lineCount: number;
  tailLines: string[];
}

/**
 * Read all log channel files from the given directory.
 *
 * @param logsDir - Absolute path to the logs directory
 *                  (e.g. the global `getLogsDir()` path).
 */
export async function readLogChannels(
  logsDir: string,
): Promise<LogChannelSummary[]> {
  if (!existsSync(logsDir)) return [];

  const entries = await readdir(logsDir, { withFileTypes: true });
  const channels: LogChannelSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;

    try {
      const filePath = resolve(logsDir, entry.name);
      const fileStat = await stat(filePath);
      const lineCount = await countNewlines(filePath);

      const tailLines = await tailFile(filePath, fileStat.size, 32768, 50);

      channels.push({
        filename: entry.name,
        byteSize: fileStat.size,
        lineCount,
        tailLines,
      });
    } catch {
      // File was deleted between readdir() and stat()/readFile() — skip it
      continue;
    }
  }

  channels.sort((a, b) => a.filename.localeCompare(b.filename));
  return channels;
}

/**
 * Read the last `maxLines` lines from a file, reading at most
 * `maxBytes` from the end. Bounded to prevent large allocations.
 */
async function tailFile(
  filePath: string,
  fileSize: number,
  maxBytes: number,
  maxLines: number,
): Promise<string[]> {
  if (fileSize === 0) return [];

  const start = Math.max(0, fileSize - maxBytes);
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(Math.min(fileSize, maxBytes));
    await fh.read(buf, 0, buf.length, start);
    const text = buf.toString('utf-8');
    const lines = text.split('\n');

    // If we didn't read from the beginning, the first chunk is
    // a partial line — drop it.
    if (start > 0) lines.shift();

    // Filter empty strings (trailing newline produces one)
    const filtered = lines.filter((l) => l.length > 0);
    return filtered.slice(-maxLines);
  } finally {
    await fh.close();
  }
}

/**
 * Count newline characters in a file using a read stream.
 * Each JSONL entry is newline-terminated, so the number of `\n`
 * bytes equals the number of entries.
 */
function countNewlines(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0;
    const stream = createReadStream(filePath);
    stream.on('data', (chunk: string | Buffer) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 0x0a) count++;
      }
    });
    stream.on('end', () => resolve(count));
    stream.on('error', reject);
  });
}
