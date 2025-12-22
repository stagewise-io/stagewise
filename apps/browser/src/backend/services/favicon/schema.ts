import {
  sqliteTable,
  integer,
  text,
  blob,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import { bigintTimestamp } from '../chrome-db-utils';

// -------------------------------------------------------------------
// Chrome Favicons Database Schema
// -------------------------------------------------------------------

export const meta = sqliteTable(
  'meta',
  {
    key: text('key').notNull().unique(),
    value: text('value'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.key] }),
  }),
);

// Icon types (Chrome's enum):
// 1 = FAVICON (default)
// 2 = TOUCH_ICON
// 4 = TOUCH_PRECOMPOSED_ICON
// 8 = WEB_MANIFEST_ICON
export const favicons = sqliteTable(
  'favicons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    url: text('url').notNull(),
    iconType: integer('icon_type').default(1).notNull(),
  },
  (table) => ({
    urlIndex: index('favicons_url').on(table.url),
  }),
);

export const faviconBitmaps = sqliteTable(
  'favicon_bitmaps',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    iconId: integer('icon_id').notNull(),
    lastUpdated: bigintTimestamp('last_updated').default(0n).notNull(),
    imageData: blob('image_data', { mode: 'buffer' }),
    width: integer('width').default(0).notNull(),
    height: integer('height').default(0).notNull(),
    lastRequested: bigintTimestamp('last_requested').default(0n).notNull(),
  },
  (table) => ({
    iconIdIndex: index('favicon_bitmaps_icon_id').on(table.iconId),
  }),
);

// Page URL types (Chrome's enum):
// 0 = NORMAL (default)
// 1 = OFFLINE_PAGE
export const iconMapping = sqliteTable(
  'icon_mapping',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pageUrl: text('page_url').notNull(),
    iconId: integer('icon_id'),
    pageUrlType: integer('page_url_type').default(0).notNull(),
  },
  (table) => ({
    pageUrlIndex: index('icon_mapping_page_url_idx').on(table.pageUrl),
    iconIdIndex: index('icon_mapping_icon_id_idx').on(table.iconId),
  }),
);
