import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import matter from 'gray-matter';
import { getBuiltinCommandsPath } from '@/utils/paths';
import xml from 'xml';
import specialTokens from '../special-tokens';

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
 * Replaces `[label](slash:id)` links in text with plain `/id` text
 * so the user's intent to invoke the command stays visible in `<user-msg>`.
 */
export function inlineSlashLinksAsText(text: string): string {
  return text.replace(SLASH_LINK_RE, (_match, id: string) => `/${id}`);
}

/** Resolved slash command with its metadata and body content. */
export interface ResolvedSlashCommand {
  id: string;
  displayName: string;
  content: string;
}

/**
 * Resolves a slash command from disk and returns its metadata + body
 * content (frontmatter stripped), or null if not found.
 */
export async function resolveSlashCommand(
  id: string,
): Promise<ResolvedSlashCommand | null> {
  const filePath = resolve(getBuiltinCommandsPath(), `${id}.md`);
  if (!existsSync(filePath)) return null;

  try {
    const raw = await readFile(filePath, 'utf-8');
    const { content, data } = matter(raw);
    const body = content.trim();
    if (!body) return null;

    return {
      id,
      displayName: typeof data.displayName === 'string' ? data.displayName : id,
      content: body,
    };
  } catch {
    return null;
  }
}

/**
 * Wraps resolved slash command content in a `<slash-command>` XML tag
 * so the LLM can clearly distinguish command instructions from user content.
 */
export function renderSlashCommandXml(cmd: ResolvedSlashCommand): string {
  return xml({
    [specialTokens.slashCommandXmlTag]: {
      _attr: { id: cmd.id, name: cmd.displayName },
      _cdata: cmd.content,
    },
  });
}
