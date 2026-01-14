import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { STAGEWISE_MD_FILENAME } from '../../generate-stagewise-md';
import { existsSync } from 'node:fs';

export async function readStagewiseMd(path: string): Promise<string | null> {
  try {
    if (!existsSync(resolve(path, STAGEWISE_MD_FILENAME))) return null;
    const content = await readFile(
      resolve(path, STAGEWISE_MD_FILENAME),
      'utf-8',
    );
    return content;
  } catch (_e) {
    return null;
  }
}
