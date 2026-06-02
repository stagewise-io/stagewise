import type { MigrationScript } from '@stagewise/agent-core/migrate-database';

const registry: MigrationScript[] = [];
const schemaVersion = 1;

export { registry, schemaVersion };
