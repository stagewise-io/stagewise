import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ignore from 'ignore';

export async function loadGitignore(
  dir: string,
): Promise<ReturnType<typeof ignore>> {
  const ig = ignore();
  const gitignorePath = join(dir, '.gitignore');

  if (existsSync(gitignorePath)) {
    const content = await readFile(gitignorePath, 'utf-8');
    ig.add(content);
  }

  // Always ignore node_modules and common non-source directories
  ig.add([
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
  ]);

  return ig;
}
