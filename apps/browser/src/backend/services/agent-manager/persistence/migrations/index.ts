import type { MigrationScript } from '@/utils/migrate-database/types';
import { up as v002Up } from './v002-add-mounted-workspaces';
import { up as v003Up } from './v003-unify-tab-ids';
import { up as v004Up } from './v004-rename-tool-suffixes';
import { up as v005Up } from './v005-backfill-file-attachment-filename';

const registry: MigrationScript[] = [
  { version: 2, name: 'add-mounted-workspaces', up: v002Up },
  { version: 3, name: 'unify-tab-ids', up: v003Up },
  { version: 4, name: 'rename-tool-suffixes', up: v004Up },
  { version: 5, name: 'backfill-file-attachment-filename', up: v005Up },
];
const schemaVersion = 5;

export { registry, schemaVersion };
