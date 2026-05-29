import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { Client } from '@libsql/client';
import { eq } from 'drizzle-orm';
import type { MigrateDatabaseArgs, SchemaWithMeta } from './types';
import { metaTable } from './types';
import type { MigrationScript } from './types';

export {
  metaTable,
  type SchemaWithMeta,
  type MigrationScript,
  type MigrateDatabaseArgs,
} from './types';

export async function migrateDatabase(
  args: MigrateDatabaseArgs,
): Promise<void> {
  const { db, client, registry, initSql, schemaVersion } = args;

  const isFresh = await checkIfFresh(db);

  if (isFresh) await runFreshInstall(client, db, initSql, schemaVersion);
  else await runMigrations(db, registry);
}

async function checkIfFresh(
  db: LibSQLDatabase<SchemaWithMeta>,
): Promise<boolean> {
  try {
    const result = await db.select().from(metaTable);
    const isFresh = result.length === 0;
    return isFresh;
  } catch {
    // Table doesn't exist yet, so database is fresh
    return true;
  }
}

async function runFreshInstall(
  client: Client,
  db: LibSQLDatabase<SchemaWithMeta>,
  startScript: string,
  schemaVersion: number,
): Promise<void> {
  await client.executeMultiple(startScript);
  await db.insert(metaTable).values({
    key: 'version',
    value: schemaVersion.toString(),
  });
}

async function runMigrations(
  db: LibSQLDatabase<SchemaWithMeta>,
  registry: MigrationScript[],
): Promise<void> {
  // Get current version
  const versionRow = await db
    .select({ value: metaTable.value })
    .from(metaTable)
    .where(eq(metaTable.key, 'version'))
    .get();

  const currentVersion = versionRow ? Number.parseInt(versionRow.value, 10) : 0;

  // Filter pending
  const pending = registry
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) return;

  //  Run migrations sequentially
  for (const migration of pending) {
    await db.transaction(async (tx) => {
      await migration.up(tx);

      await tx
        .update(metaTable)
        .set({ value: migration.version.toString() })
        .where(eq(metaTable.key, 'version'));
    });
  }
}
