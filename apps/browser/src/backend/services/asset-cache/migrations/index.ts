import type { MigrationScript } from '@/utils/migrate-database/types';

const registry: MigrationScript[] = [];
const schemaVersion = 1;

export { registry, schemaVersion };
