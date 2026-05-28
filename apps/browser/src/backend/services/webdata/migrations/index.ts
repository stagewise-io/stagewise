import type { MigrationScript } from '../../../utils/migrate-database/types';
import { up as v002Up } from './v002-backfill-default-search-engines';

const registry: MigrationScript[] = [
  { version: 2, name: 'backfill-default-search-engines', up: v002Up },
];
const schemaVersion = 2;

export { registry, schemaVersion };
