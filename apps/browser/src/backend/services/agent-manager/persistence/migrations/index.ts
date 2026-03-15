import type { MigrationScript } from '@/utils/migrate-database/types';
import { up as v002Up } from './v002-add-mounted-workspaces';
import { up as v003Up } from './v003-unify-tab-ids';

const registry: MigrationScript[] = [
  { version: 2, name: 'add-mounted-workspaces', up: v002Up },
  { version: 3, name: 'unify-tab-ids', up: v003Up },
];
const schemaVersion = 3;

export { registry, schemaVersion };
