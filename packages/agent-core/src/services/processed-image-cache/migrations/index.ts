import type { MigrationScript } from '../../../migrate-database';

const registry: MigrationScript[] = [];
const schemaVersion = 1;

export { registry, schemaVersion };
