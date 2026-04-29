import { sql } from 'drizzle-orm';
import type { MigrationScript } from '@/utils/migrate-database/types';

/**
 * v9 — add-tool-approval-mode
 *
 * Adds the `tool_approval_mode` column to `agentInstances`. Existing rows
 * default to 'alwaysAsk' to preserve the safe, current behaviour.
 */
export const up: MigrationScript['up'] = async (db) => {
  await db.run(
    sql`ALTER TABLE agentInstances ADD COLUMN tool_approval_mode TEXT NOT NULL DEFAULT 'alwaysAsk'`,
  );
};
