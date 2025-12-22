import {
  sqliteTable,
  integer,
  text,
  blob,
  numeric,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { bigintTimestamp, sqliteBoolean } from '../chrome-db-utils';

// -------------------------------------------------------------------
// 1. Core History Tables
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

export const urls = sqliteTable(
  'urls',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    url: text('url'),
    title: text('title'),
    visitCount: integer('visit_count').default(0).notNull(),
    typedCount: integer('typed_count').default(0).notNull(),
    lastVisitTime: bigintTimestamp('last_visit_time').notNull(),
    hidden: sqliteBoolean('hidden').default(false).notNull(),
  },
  (table) => ({
    urlIndex: index('urls_url_index').on(table.url),
  }),
);

export const visits = sqliteTable(
  'visits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    url: integer('url').notNull(),
    visitTime: bigintTimestamp('visit_time').notNull(),
    fromVisit: integer('from_visit'),
    externalReferrerUrl: text('external_referrer_url'),
    transition: integer('transition').default(0).notNull(),
    segmentId: integer('segment_id'),
    visitDuration: bigintTimestamp('visit_duration').default(0n).notNull(),
    incrementedOmniboxTypedScore: sqliteBoolean(
      'incremented_omnibox_typed_score',
    )
      .default(false)
      .notNull(),
    openerVisit: integer('opener_visit'),
    originatorCacheGuid: text('originator_cache_guid'),
    originatorVisitId: integer('originator_visit_id'),
    originatorFromVisit: integer('originator_from_visit'),
    originatorOpenerVisit: integer('originator_opener_visit'),
    isKnownToSync: sqliteBoolean('is_known_to_sync').default(false).notNull(),
    considerForNtpMostVisited: sqliteBoolean('consider_for_ntp_most_visited')
      .default(false)
      .notNull(),
    visitedLinkId: integer('visited_link_id').default(0).notNull(),
    appId: text('app_id'),
  },
  (table) => ({
    urlIndex: index('visits_url_index').on(table.url),
    fromIndex: index('visits_from_index').on(table.fromVisit),
    timeIndex: index('visits_time_index').on(table.visitTime),
    originatorIdIndex: index('visits_originator_id_index').on(
      table.originatorVisitId,
    ),
  }),
);

export const visitSource = sqliteTable('visit_source', {
  id: integer('id').primaryKey(),
  source: integer('source').notNull(),
});

export const visitedLinks = sqliteTable(
  'visited_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    linkUrlId: integer('link_url_id').notNull(),
    topLevelUrl: text('top_level_url').notNull(),
    frameUrl: text('frame_url').notNull(),
    visitCount: integer('visit_count').default(0).notNull(),
  },
  (table) => ({
    visitedLinksIndex: index('visited_links_index').on(
      table.linkUrlId,
      table.topLevelUrl,
      table.frameUrl,
    ),
  }),
);

// -------------------------------------------------------------------
// 2. Downloads
// -------------------------------------------------------------------

export const downloads = sqliteTable('downloads', {
  id: integer('id').primaryKey(),
  guid: text('guid').notNull(),
  currentPath: text('current_path').notNull(),
  targetPath: text('target_path').notNull(),
  startTime: bigintTimestamp('start_time').notNull(),
  receivedBytes: integer('received_bytes').notNull(),
  totalBytes: integer('total_bytes').notNull(),
  state: integer('state').notNull(),
  dangerType: integer('danger_type').notNull(),
  interruptReason: integer('interrupt_reason').notNull(),
  hash: blob('hash').notNull(),
  endTime: bigintTimestamp('end_time').notNull(),
  opened: sqliteBoolean('opened').notNull(),
  lastAccessTime: bigintTimestamp('last_access_time').notNull(),
  transient: sqliteBoolean('transient').notNull(),
  referrer: text('referrer').notNull(),
  siteUrl: text('site_url').notNull(),
  embedderDownloadData: text('embedder_download_data').notNull(),
  tabUrl: text('tab_url').notNull(),
  tabReferrerUrl: text('tab_referrer_url').notNull(),
  httpMethod: text('http_method').notNull(),
  byExtId: text('by_ext_id').notNull(),
  byExtName: text('by_ext_name').notNull(),
  byWebAppId: text('by_web_app_id').notNull(),
  etag: text('etag').notNull(),
  lastModified: text('last_modified').notNull(),
  mimeType: text('mime_type').notNull(),
  originalMimeType: text('original_mime_type').notNull(),
});

export const downloadsUrlChains = sqliteTable(
  'downloads_url_chains',
  {
    id: integer('id').notNull(),
    chainIndex: integer('chain_index').notNull(),
    url: text('url').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.chainIndex] }),
  }),
);

export const downloadsSlices = sqliteTable(
  'downloads_slices',
  {
    downloadId: integer('download_id').notNull(),
    offset: integer('offset').notNull(),
    receivedBytes: integer('received_bytes').notNull(),
    finished: sqliteBoolean('finished').default(false).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.downloadId, table.offset] }),
  }),
);

// -------------------------------------------------------------------
// 3. Search & Keywords
// -------------------------------------------------------------------

export const keywordSearchTerms = sqliteTable(
  'keyword_search_terms',
  {
    keywordId: integer('keyword_id').notNull(),
    urlId: integer('url_id').notNull(),
    term: text('term').notNull(),
    normalizedTerm: text('normalized_term').notNull(),
  },
  (table) => ({
    index1: index('keyword_search_terms_index1').on(
      table.keywordId,
      table.normalizedTerm,
    ),
    index2: index('keyword_search_terms_index2').on(table.urlId),
    index3: index('keyword_search_terms_index3').on(table.term),
  }),
);

// -------------------------------------------------------------------
// 4. Segments
// -------------------------------------------------------------------

export const segments = sqliteTable(
  'segments',
  {
    id: integer('id').primaryKey(),
    name: text('name'),
    urlId: integer('url_id').notNull(),
  },
  (table) => ({
    nameIndex: index('segments_name').on(table.name),
    urlIdIndex: index('segments_url_id').on(table.urlId),
  }),
);

export const segmentUsage = sqliteTable(
  'segment_usage',
  {
    id: integer('id').primaryKey(),
    segmentId: integer('segment_id').notNull(),
    timeSlot: integer('time_slot').notNull(),
    visitCount: integer('visit_count').default(0).notNull(),
  },
  (table) => ({
    timeSlotSegIdIndex: index('segment_usage_time_slot_segment_id').on(
      table.timeSlot,
      table.segmentId,
    ),
    usageSegIdIndex: index('segments_usage_seg_id').on(table.segmentId),
  }),
);

// -------------------------------------------------------------------
// 5. Intelligent Features (Clusters, Annotations)
// -------------------------------------------------------------------

export const clusters = sqliteTable('clusters', {
  clusterId: integer('cluster_id').primaryKey({ autoIncrement: true }),
  shouldShowOnProminentUiSurfaces: sqliteBoolean(
    'should_show_on_prominent_ui_surfaces',
  ).notNull(),
  label: text('label').notNull(),
  rawLabel: text('raw_label').notNull(),
  triggerabilityCalculated: sqliteBoolean(
    'triggerability_calculated',
  ).notNull(),
  originatorCacheGuid: text('originator_cache_guid').notNull(),
  originatorClusterId: integer('originator_cluster_id').notNull(),
});

export const clustersAndVisits = sqliteTable(
  'clusters_and_visits',
  {
    clusterId: integer('cluster_id').notNull(),
    visitId: integer('visit_id').notNull(),
    score: numeric('score').default(sql`0`).notNull(),
    engagementScore: numeric('engagement_score').default(sql`0`).notNull(),
    urlForDeduping: text('url_for_deduping').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    urlForDisplay: text('url_for_display').notNull(),
    interactionState: integer('interaction_state').default(0).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.clusterId, table.visitId] }),
    clustersForVisitIndex: index('clusters_for_visit').on(table.visitId),
  }),
);

export const clusterKeywords = sqliteTable(
  'cluster_keywords',
  {
    clusterId: integer('cluster_id').notNull(),
    keyword: text('keyword').notNull(),
    type: integer('type').notNull(),
    score: numeric('score').notNull(),
    collections: text('collections').notNull(),
  },
  (table) => ({
    clusterIdIndex: index('cluster_keywords_cluster_id_index').on(
      table.clusterId,
    ),
  }),
);

export const clusterVisitDuplicates = sqliteTable(
  'cluster_visit_duplicates',
  {
    visitId: integer('visit_id').notNull(),
    duplicateVisitId: integer('duplicate_visit_id').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.visitId, table.duplicateVisitId] }),
  }),
);

export const contentAnnotations = sqliteTable('content_annotations', {
  visitId: integer('visit_id').primaryKey(),
  visibilityScore: numeric('visibility_score'),
  flocProtectedScore: numeric('floc_protected_score'),
  categories: text('categories'),
  pageTopicsModelVersion: integer('page_topics_model_version'),
  annotationFlags: integer('annotation_flags').notNull(),
  entities: text('entities'),
  relatedSearches: text('related_searches'),
  searchNormalizedUrl: text('search_normalized_url'),
  searchTerms: text('search_terms'),
  alternativeTitle: text('alternative_title'),
  pageLanguage: text('page_language'),
  passwordState: integer('password_state').default(0).notNull(),
  hasUrlKeyedImage: sqliteBoolean('has_url_keyed_image').notNull(),
});

export const contextAnnotations = sqliteTable('context_annotations', {
  visitId: integer('visit_id').primaryKey(),
  contextAnnotationFlags: integer('context_annotation_flags').notNull(),
  durationSinceLastVisit: integer('duration_since_last_visit'),
  pageEndReason: integer('page_end_reason'),
  totalForegroundDuration: integer('total_foreground_duration'),
  browserType: integer('browser_type').default(0).notNull(),
  windowId: integer('window_id').default(-1).notNull(),
  tabId: integer('tab_id').default(-1).notNull(),
  taskId: integer('task_id').default(-1).notNull(),
  rootTaskId: integer('root_task_id').default(-1).notNull(),
  parentTaskId: integer('parent_task_id').default(-1).notNull(),
  responseCode: integer('response_code').default(0).notNull(),
});

// -------------------------------------------------------------------
// 6. Internal / Sync
// -------------------------------------------------------------------

export const historySyncMetadata = sqliteTable('history_sync_metadata', {
  storageKey: integer('storage_key').primaryKey(),
  value: blob('value'),
});
