import {
  sqliteTable,
  integer,
  text,
  blob,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

// -------------------------------------------------------------------
// Chrome Web Data Database Schema - Keywords Table
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

// Keywords table - stores search engine definitions
// This matches Chrome's exact schema from the Web Data database
export const keywords = sqliteTable(
  'keywords',
  {
    id: integer('id').primaryKey(),
    shortName: text('short_name').notNull(),
    keyword: text('keyword').notNull(),
    faviconUrl: text('favicon_url').notNull(),
    url: text('url').notNull(),
    safeForAutoreplace: integer('safe_for_autoreplace'),
    originatingUrl: text('originating_url'),
    dateCreated: integer('date_created').default(0),
    usageCount: integer('usage_count').default(0),
    inputEncodings: text('input_encodings'),
    suggestUrl: text('suggest_url'),
    prepopulateId: integer('prepopulate_id').default(0),
    createdByPolicy: integer('created_by_policy').default(0),
    lastModified: integer('last_modified').default(0),
    syncGuid: text('sync_guid'),
    alternateUrls: text('alternate_urls'),
    imageUrl: text('image_url'),
    searchUrlPostParams: text('search_url_post_params'),
    suggestUrlPostParams: text('suggest_url_post_params'),
    imageUrlPostParams: text('image_url_post_params'),
    newTabUrl: text('new_tab_url'),
    lastVisited: integer('last_visited').default(0),
    createdFromPlayApi: integer('created_from_play_api').default(0),
    isActive: integer('is_active').default(0),
    starterPackId: integer('starter_pack_id').default(0),
    enforcedByPolicy: integer('enforced_by_policy').default(0),
    featuredByPolicy: integer('featured_by_policy').default(0),
    urlHash: blob('url_hash'),
  },
  (table) => ({
    keywordIndex: index('keywords_keyword_index').on(table.keyword),
  }),
);
