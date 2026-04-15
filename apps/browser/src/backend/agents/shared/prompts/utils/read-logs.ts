import { createReadStream, existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface LogChannelSummary {
  filename: string;
  byteSize: number;
  lineCount: number;
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

      channels.push({
        filename: entry.name,
        byteSize: fileStat.size,
        lineCount,
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
