import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@stagewise/agent-core/migrate-database';

/** Add the persistent user-controlled unread marker. */
export const up: MigrationScript['up'] = async (db) => {
  await db.run(
    sql`ALTER TABLE agentInstances ADD COLUMN marked_unread INTEGER NOT NULL DEFAULT 0`,
  );
};
