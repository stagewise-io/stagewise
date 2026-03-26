import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import matter from 'gray-matter';
import type { CommandDefinition } from '@shared/commands';

export async function discoverCommands(
  commandsDir: string,
): Promise<CommandDefinition[]> {
  if (!existsSync(commandsDir)) return [];

  const entries = await readdir(commandsDir, { withFileTypes: true });
  const commands: CommandDefinition[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name) !== '.md') continue;

    const filePath = resolve(commandsDir, entry.name);
    const id = `command:${basename(entry.name, '.md')}`;

    let raw: string;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    let data: Record<string, unknown>;
    try {
      ({ data } = matter(raw));
    } catch {
      continue;
    }

    const displayName =
      typeof data.displayName === 'string' ? data.displayName : undefined;
    const description =
      typeof data.description === 'string' ? data.description : undefined;
    const hidden = data.hidden === true;

    if (!displayName || !description) continue;

    commands.push({
      id,
      displayName,
      description,
      source: 'builtin',
      contentPath: filePath,
      ...(hidden && { hidden }),
    });
  }

  return commands;
}
