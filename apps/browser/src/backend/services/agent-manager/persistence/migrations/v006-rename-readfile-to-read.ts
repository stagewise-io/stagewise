import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@/utils/migrate-database/types';
import superjson from 'superjson';

/**
 * v6 — rename file tools & params
 *
 * Rewrites persisted AgentMessage blobs to align with the tool renames
 * introduced in this release:
 *
 * Tool type renames:
 *   - `"tool-readFile"`      → `"tool-read"`
 *   - `"tool-deleteFile"`    → `"tool-delete"`
 *   - `"tool-overwriteFile"` → `"tool-write"`
 *
 * Parameter renames (in `input` objects of affected tools):
 *   - `"relative_path"` → `"path"` for tools: read, write, delete, multiEdit
 */

/** Maps old tool-part type → new tool-part type */
const TOOL_TYPE_RENAMES: Record<string, string> = {
  'tool-readFile': 'tool-read',
  'tool-deleteFile': 'tool-delete',
  'tool-overwriteFile': 'tool-write',
};

/** Tool types whose `input.relative_path` should be renamed to `input.path` */
const TOOLS_WITH_PATH_RENAME = new Set([
  // Post-rename names
  'tool-read',
  'tool-write',
  'tool-delete',
  'tool-multiEdit',
  // Pre-rename names (in case type rename hasn't been applied yet in this row)
  'tool-readFile',
  'tool-overwriteFile',
  'tool-deleteFile',
]);

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
        `[migration:rename-file-tools] Skipping row ${row.id}: ${err}`,
      );
    }
  }
};

/**
 * Walks an AgentMessage[] blob and:
 *   1. Renames tool part types (readFile→read, deleteFile→delete, overwriteFile→write)
 *   2. Renames `input.relative_path` → `input.path` for file tools
 *
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

      // 1. Rename tool type
      if (typeof p.type === 'string' && p.type in TOOL_TYPE_RENAMES) {
        p.type = TOOL_TYPE_RENAMES[p.type]!;
        changed = true;
      }

      // 2. Rename relative_path → path in input
      if (
        typeof p.type === 'string' &&
        TOOLS_WITH_PATH_RENAME.has(p.type) &&
        p.input &&
        typeof p.input === 'object'
      ) {
        const input = p.input as Record<string, unknown>;
        if ('relative_path' in input && !('path' in input)) {
          input.path = input.relative_path;
          delete input.relative_path;
          changed = true;
        }
      }
    }
  }

  return changed;
}
