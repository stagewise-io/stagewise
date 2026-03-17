import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@/utils/migrate-database/types';
import superjson from 'superjson';

/**
 * v4 — rename-tool-suffixes
 *
 * Rewrites persisted AgentMessage blobs so that tool part `type` fields
 * have the "Tool" suffix removed.
 *
 * e.g. "tool-readFileTool" → "tool-readFile"
 *      "tool-globTool"     → "tool-glob"
 */

const TOOL_SUFFIX_RE = /^tool-(.+)Tool$/;

export const up: MigrationScript['up'] = async (db) => {
  const rows = await db.all<{
    id: string;
    history: string;
    queued_messages: string;
  }>(sql`SELECT id, history, queued_messages FROM agentInstances`);

  for (const row of rows) {
    try {
      let historyChanged = false;
      let queuedChanged = false;

      const history = superjson.parse<unknown[]>(row.history);
      if (Array.isArray(history)) {
        historyChanged = migrateMessages(history);
      }

      let queued: unknown[] | null = null;
      if (row.queued_messages) {
        queued = superjson.parse<unknown[]>(row.queued_messages);
        if (Array.isArray(queued)) {
          queuedChanged = migrateMessages(queued);
        }
      }

      if (historyChanged || queuedChanged) {
        const newHistory = superjson.stringify(history);
        const newQueued = queuedChanged
          ? superjson.stringify(queued)
          : row.queued_messages;
        await db.run(
          sql`UPDATE agentInstances SET history = ${newHistory}, queued_messages = ${newQueued} WHERE id = ${row.id}`,
        );
      }
    } catch (err) {
      console.warn(
        `[migration:rename-tool-suffixes] Skipping row ${row.id}: ${err}`,
      );
    }
  }
};

/**
 * Walks an AgentMessage[] blob and renames tool part types
 * from "tool-xyzTool" to "tool-xyz".
 * Returns true if any changes were made.
 */
function migrateMessages(messages: unknown[]): boolean {
  let changed = false;

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    const parts = (msg as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      if (!part || typeof part !== 'object') continue;
      const p = part as Record<string, unknown>;
      if (typeof p.type !== 'string') continue;

      const match = TOOL_SUFFIX_RE.exec(p.type);
      if (match) {
        p.type = `tool-${match[1]}`;
        changed = true;
      }
    }
  }

  return changed;
}
