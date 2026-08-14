import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@stagewise/agent-core/migrate-database';

/** Persist whether a top-level chat was explicitly archived by the user. */
export const up: MigrationScript['up'] = async (db) => {
  await db.run(sql`ALTER TABLE agentInstances ADD COLUMN archived_at INTEGER`);
};
