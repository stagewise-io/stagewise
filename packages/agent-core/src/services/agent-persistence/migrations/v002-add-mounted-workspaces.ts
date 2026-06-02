import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@stagewise/agent-core/migrate-database';

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
