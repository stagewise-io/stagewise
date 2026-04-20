import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@/utils/migrate-database/types';
import superjson from 'superjson';

/**
 * v7 — normalize-history
 *
 * Extracts persisted AgentMessage history blobs from the monolithic
 * `agentInstances.history` column into individual rows in the new
 * `agentMessages` table. The original `history` column is left intact
 * as a rollback safety net — a future v008 migration will clear it
 * once the normalised path is proven in production.
 */
export const up: MigrationScript['up'] = async (db) => {
  // 1. Create the agentMessages table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS agentMessages (
      agent_instance_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      message_id TEXT NOT NULL,
      role TEXT NOT NULL,
      parts TEXT NOT NULL,
      metadata TEXT,
      PRIMARY KEY (agent_instance_id, seq)
    )
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS agent_messages_agent_id_index
    ON agentMessages(agent_instance_id)
  `);

  // 2. Extract history blobs into individual message rows
  const rows = await db.all<{
    id: string;
    history: string;
  }>(sql`SELECT id, history FROM agentInstances`);

  for (const row of rows) {
    try {
      if (!row.history) continue;

      const history = superjson.parse<unknown[]>(row.history);
      if (!Array.isArray(history) || history.length === 0) continue;

      for (let i = 0; i < history.length; i++) {
        const msg = history[i];
        if (!msg || typeof msg !== 'object') continue;

        const m = msg as Record<string, unknown>;
        if (typeof m.id !== 'string' || typeof m.role !== 'string') {
          console.warn(
            `[migration:normalize-history] Skipping invalid message at index ${i} in agent ${row.id}`,
          );
          continue;
        }

        const partsStr =
          m.parts != null ? superjson.stringify(m.parts) : '{"json":[]}';
        const metaStr =
          m.metadata != null ? superjson.stringify(m.metadata) : null;

        await db.run(
          sql`INSERT INTO agentMessages (agent_instance_id, seq, message_id, role, parts, metadata)
              VALUES (${row.id}, ${i}, ${m.id as string}, ${m.role as string}, ${partsStr}, ${metaStr})`,
        );
      }
    } catch (err) {
      console.warn(
        `[migration:normalize-history] Skipping row ${row.id}: ${err}`,
      );
    }
  }

  // history column is intentionally left intact for rollback safety.
};
