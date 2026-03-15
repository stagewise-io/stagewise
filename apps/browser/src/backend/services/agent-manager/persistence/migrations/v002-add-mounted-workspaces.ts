import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@/utils/migrate-database/types';

/**
 * v2 — add-mounted-workspaces
 *
 * Adds the `mounted_workspaces` column to `agentInstances`.
 */
export const up: MigrationScript['up'] = async (db) => {
  await db.run(
    sql`ALTER TABLE agentInstances ADD COLUMN mounted_workspaces TEXT`,
  );
};
