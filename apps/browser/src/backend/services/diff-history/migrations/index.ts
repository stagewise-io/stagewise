import { sql } from 'drizzle-orm';
import type { MigrationScript } from '../../../utils/migrate-database/types';

const registry: MigrationScript[] = [
  {
    version: 2,
    name: 'add-composite-filepath-op-idx',
    up: async (db) => {
      await db.run(sql`
        CREATE INDEX IF NOT EXISTS operations_filepath_op_idx
        ON operations(filepath, operation, idx DESC, snapshot_oid)
      `);
    },
  },
];
const schemaVersion = 2;

export { registry, schemaVersion };
