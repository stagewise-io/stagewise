import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@stagewise/agent-core/migrate-database';

/**
 * v10 — add-active-provider-instance-id
 *
 * Adds the `active_provider_instance_id` column to `agentInstances`.
 * Nullable — existing rows have no value, and consumers default to
 * `'stagewise-default'` at read time.
 */
export const up: MigrationScript['up'] = async (db) => {
  await db.run(
    sql`ALTER TABLE agentInstances ADD COLUMN active_provider_instance_id TEXT`,
  );
};
