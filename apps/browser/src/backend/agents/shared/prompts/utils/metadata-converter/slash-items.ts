import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import matter from 'gray-matter';
import { getBuiltinCommandsPath } from '@/utils/paths';

/** Regex to match `[label](slash:id)` links in message text. */
const SLASH_LINK_RE = /\[[^\]]*\]\(slash:([^)]+)\)/g;

/**
 * Extracts slash command IDs from the text parts of a message.
 */
export function extractSlashIdsFromText(
  parts: ReadonlyArray<{ type: string; text?: string }>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    if (part.type !== 'text' || !part.text) continue;
    for (const match of part.text.matchAll(SLASH_LINK_RE)) {
      const id = match[1]!;
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }

  return ids;
}

/**
 * Strips `[label](slash:id)` links from text, returning only the
 * remaining user-authored content (trimmed).
 */
export function stripSlashLinksFromText(text: string): string {
  return text.replace(SLASH_LINK_RE, '').trim();
}

/**
 * Resolves a slash command's content from disk and returns it as
 * plain text (frontmatter stripped).
 *
 * @param id - The slash command id (e.g. "implement", "plan")
 * @returns Plain-text command content, or null if not found
 */
export async function resolveSlashCommandContent(
  id: string,
): Promise<string | null> {
  const filePath = resolve(getBuiltinCommandsPath(), `${id}.md`);
  if (!existsSync(filePath)) return null;

  try {
    const raw = await readFile(filePath, 'utf-8');
    const { content } = matter(raw);
    return content.trim() || null;
  } catch {
    return null;
  }
}
