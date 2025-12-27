import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

export async function readStagewiseMd(path: string): Promise<string | null> {
  try {
    if (!existsSync(resolve(path, 'STAGEWISE.md'))) return null;
    const content = await readFile(resolve(path, 'STAGEWISE.md'), 'utf-8');
    return content;
  } catch (_e) {
    return null;
  }
}
