import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@/utils/migrate-database/types';

/**
 * v8 — add-title-locked-by-user
 *
 * Adds the `title_locked_by_user` column to `agentInstances`.
 * When set to 1 (true), auto title-generation is skipped for the agent.
 */
export const up: MigrationScript['up'] = async (db) => {
  await db.run(
    sql`ALTER TABLE agentInstances ADD COLUMN title_locked_by_user INTEGER`,
  );
};
