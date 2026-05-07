import type { MigrationScript } from '@/utils/migrate-database/types';
import { up as v002Up } from './v002-add-mounted-workspaces';
import { up as v003Up } from './v003-unify-tab-ids';
import { up as v004Up } from './v004-rename-tool-suffixes';
import { up as v005Up } from './v005-backfill-file-attachment-filename';
import { up as v006Up } from './v006-rename-readfile-to-read';
import { up as v007Up } from './v007-normalize-history';
import { up as v008Up } from './v008-add-title-locked-by-user';
import { up as v009Up } from './v009-add-tool-approval-mode';
import { up as v010Up } from './v010-add-associated-browser-tabs';

const registry: MigrationScript[] = [
  { version: 2, name: 'add-mounted-workspaces', up: v002Up },
  { version: 3, name: 'unify-tab-ids', up: v003Up },
  { version: 4, name: 'rename-tool-suffixes', up: v004Up },
  { version: 5, name: 'backfill-file-attachment-filename', up: v005Up },
  { version: 6, name: 'rename-file-tools', up: v006Up },
  { version: 7, name: 'normalize-history', up: v007Up },
  { version: 8, name: 'add-title-locked-by-user', up: v008Up },
  { version: 9, name: 'add-tool-approval-mode', up: v009Up },
  { version: 10, name: 'add-associated-browser-tabs', up: v010Up },
];
const schemaVersion = 10;

export { registry, schemaVersion };
