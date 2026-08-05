import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@stagewise/agent-core/migrate-database';

/** Replace the temporary manual-marker name with the unified unread state. */
export const up: MigrationScript['up'] = async (db) => {
  await db.run(
    sql`ALTER TABLE agentInstances RENAME COLUMN marked_unread TO unread`,
  );
};
