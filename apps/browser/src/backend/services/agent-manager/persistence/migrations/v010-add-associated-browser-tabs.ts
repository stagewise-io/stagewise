import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@/utils/migrate-database/types';

/**
 * v10 — add-associated-browser-tabs
 *
 * Stores a versioned JSON snapshot of browser tabs explicitly associated with
 * an archived agent so they can be restored when that agent is resumed.
 */
export const up: MigrationScript['up'] = async (db) => {
  await db.run(
    sql`ALTER TABLE agentInstances ADD COLUMN associated_browser_tabs TEXT`,
  );
};
