import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import type { SkillDefinition, SkillDefinitionUI } from '@shared/skills';
import xml from 'xml';
import specialTokens from '../special-tokens';

/** Regex to match `[label](slash:id)` links in message text. */
const SLASH_LINK_RE = /\[([^\]]*)\]\(slash:([^)]+)\)/g;

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
      const id = match[2]!;
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }

  return ids;
}

/**
 * Sources whose skill IDs are bundled with the app binary and therefore
 * safe to ship to telemetry as plaintext. `workspace` and `global` skill
 * IDs are user-controlled (derived from filesystem paths) and can leak
 * project/branch/personal names — those get hashed instead.
 */
const SAFE_SLASH_ID_SOURCES = new Set(['builtin', 'plugin']);

/**
 * Redact slash command IDs for telemetry. Builtin/plugin IDs pass through
 * as plaintext; workspace/global (and any unknown) IDs are replaced with
 * a stable `user:<hash>` token so aggregate analytics still work without
 * leaking user-controlled strings.
 *
 * Unknown IDs (not present in `skills`) fail safe — hashed, not dropped,
 * so we can still count them.
 */
export function redactSlashIdsForTelemetry(
  ids: ReadonlyArray<string>,
  skills: ReadonlyArray<Pick<SkillDefinitionUI, 'id' | 'source'>>,
): string[] {
  if (ids.length === 0) return [];
  const sourceById = new Map(skills.map((s) => [s.id, s.source]));
  return ids.map((id) => {
    const source = sourceById.get(id);
    if (source && SAFE_SLASH_ID_SOURCES.has(source)) return id;
    const hash = createHash('sha256').update(id).digest('hex').slice(0, 12);
    return `user:${hash}`;
  });
}

/**
 * Replaces `[label](slash:id)` links in text with the human-readable
 * label (e.g. `/plan`) so the command invocation stays visible in
 * `<user-msg>` without leaking internal composite IDs.
 */
export function inlineSlashLinksAsText(text: string): string {
  return text.replace(SLASH_LINK_RE, (_match, label: string) => `/${label}`);
}

/** Resolved slash command with its metadata and body content. */
export interface ResolvedSlashCommand {
  id: string;
  displayName: string;
  content: string;
}

/**
 * Resolves a slash-invoked skill from disk and returns its metadata + body
 * content (frontmatter stripped), or null if not found.
 *
 * The skill is looked up by `id` in the provided `skills` list
 * and its `contentPath` is used for disk resolution. This supports
 * builtin, workspace-skill, and plugin-skill sources.
 */
export async function resolveSlashSkill(
  id: string,
  skills: ReadonlyArray<SkillDefinition>,
): Promise<ResolvedSlashCommand | null> {
  const cmd = skills.find((c) => c.id === id);
  if (!cmd) return null;

  const filePath = cmd.contentPath;
  if (!existsSync(filePath)) return null;

  try {
    const raw = await readFile(filePath, 'utf-8');
    const { content } = matter(raw);
    const body = content.trim();
    if (!body) return null;

    return {
      id,
      displayName: cmd.displayName,
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
