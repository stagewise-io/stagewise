import type { Logger } from '../logger';
import type { TelemetryService } from '../telemetry';
import {
  eq,
  and,
  or,
  desc,
  gte,
  lte,
  like,
  sql,
  inArray,
  type InferSelectModel,
  type SQL,
} from 'drizzle-orm';
import * as schema from './migrations/schema';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import {
  PageTransition,
  type VisitInput,
  type HistoryFilter,
} from '@shared/karton-contracts/pages-api/types';
import { toWebKitTimestamp, fromWebKitTimestamp } from '../chrome-db-utils';
import initSql from './schema.sql?raw';
import { migrateDatabase } from '@stagewise/agent-core/migrate-database';
import { registry, schemaVersion } from './migrations';
import type { WebDataService } from '../webdata';
import { getDbPath } from '@/utils/paths';

// Internal result type without favicon (added by PagesService)
export interface HistoryQueryResult {
  visitId: number;
  urlId: number;
  url: string;
  title: string | null;
  visitTime: Date;
  visitCount: number;
  transition: number;
}

// Result type for origin-grouped visit counts
export interface OriginVisitCount {
  origin: string;
  visitCount: number;
  lastVisitTime: Date;
}

/**
 * Service responsible for managing browsing history.
 */
export class HistoryService {
  private logger: Logger;
  private dbDriver;
  private db;
  private webDataService: WebDataService | null;
  private readonly telemetryService: TelemetryService;

  private constructor(
    logger: Logger,
    webDataService: WebDataService | null,
    telemetryService: TelemetryService,
  ) {
    this.logger = logger;
    this.webDataService = webDataService;
    this.telemetryService = telemetryService;
    const dbPath = getDbPath('history');
    this.dbDriver = createClient({
      url: `file:${dbPath}`,
      intMode: 'bigint', // WebKit timestamps exceed Number.MAX_SAFE_INTEGER
    });
    this.db = drizzle(this.dbDriver, {
      schema,
    });
  }

  private report(
    error: Error,
    operation: string,
    extra?: Record<string, unknown>,
  ) {
    this.telemetryService.captureException(error, {
      service: 'history',
      operation,
      ...extra,
    });
  }

  public static async create(
    logger: Logger,
    webDataService: WebDataService | null,
    telemetryService: TelemetryService,
  ): Promise<HistoryService> {
    const instance = new HistoryService(
      logger,
      webDataService,
      telemetryService,
    );
    await instance.initialize();
    logger.debug('[HistoryService] Created service');
    return instance;
  }

  private async initialize(): Promise<void> {
    this.logger.debug('[HistoryService] Initializing...');
    try {
      await migrateDatabase({
        db: this.db,
        client: this.dbDriver,
        registry,
        initSql,
        schemaVersion,
      });
      this.logger.debug('[HistoryService] Initialized');
    } catch (e) {
      this.logger.error('[HistoryService] Failed to initialize', { error: e });
      this.report(e as Error, 'migration');
    }
  }

  /**
   * Teardown the History service
   */
  public teardown(): void {
    this.logger.debug('[HistoryService] Shutdown complete');
  }

  // =================================================================
  //  A. STORAGE API (WRITE)
  // =================================================================

  /**
   * Internal helper: inserts the visit record into the database.
   * @returns Object containing the visit ID and URL ID
   */
  private async _insertVisitRecord(
    input: VisitInput,
  ): Promise<{ visitId: number; urlId: number }> {
    return await this.db.transaction(async (tx) => {
      const now = input.visitTime
        ? toWebKitTimestamp(input.visitTime)
        : toWebKitTimestamp(new Date());

      const MAX_URL_LENGTH = 2048;
      const normalizedUrl =
        input.url.length > MAX_URL_LENGTH
          ? input.url.substring(0, MAX_URL_LENGTH)
          : input.url;

      // Find or create URL entry
      let urlId: number;
      const existingUrl = await tx
        .select()
        .from(schema.urls)
        .where(eq(schema.urls.url, normalizedUrl))
        .get();

      if (existingUrl) {
        urlId = Number(existingUrl.id);
        await tx
          .update(schema.urls)
          .set({
            visitCount: Number(existingUrl.visitCount) + 1,
            lastVisitTime: now,
            title: input.title || existingUrl.title,
            typedCount:
              input.transition === PageTransition.TYPED
                ? Number(existingUrl.typedCount) + 1
                : Number(existingUrl.typedCount),
          })
          .where(eq(schema.urls.id, urlId));
      } else {
        const result = await tx
          .insert(schema.urls)
          .values({
            url: normalizedUrl,
            title: input.title || '',
            visitCount: 1,
            typedCount: input.transition === PageTransition.TYPED ? 1 : 0,
            lastVisitTime: now,
            hidden: false,
          })
          .returning({ id: schema.urls.id });
        urlId = Number(result[0].id);
      }

      // Create visit entry
      const visitResult = await tx
        .insert(schema.visits)
        .values({
          url: urlId,
          visitTime: now,
          fromVisit: input.referrerVisitId || 0,
          transition: input.transition ?? PageTransition.LINK,
          visitDuration: input.durationMs
            ? BigInt(input.durationMs * 1000)
            : 0n,
          isKnownToSync: !input.isLocal,
        })
        .returning({ id: schema.visits.id });

      const visitId = Number(visitResult[0].id);

      // Mark source if synced
      if (input.isLocal === false) {
        await tx.insert(schema.visitSource).values({
          id: visitId,
          source: 1,
        });
      }

      return { visitId, urlId };
    });
  }

  /**
   * Log a search term that resulted in a click (for Omnibox suggestions).
   * @param keywordId - The keyword ID from the Web Data keywords table
   * @param urlId - The URL ID from the urls table
   * @param term - The search term entered by the user
   */
  async addSearchTerm(
    keywordId: number,
    urlId: number,
    term: string,
  ): Promise<void> {
    await this.db.insert(schema.keywordSearchTerms).values({
      keywordId,
      urlId,
      term,
      normalizedTerm: term.toLowerCase().trim(),
    });
  }

  /**
   * Records a page visit. Creates or updates URL entry, inserts visit record,
   * and extracts/stores search term if the URL is a search engine.
   * @returns Object containing the visit ID and URL ID
   */
  async addVisit(
    input: VisitInput,
  ): Promise<{ visitId: number; urlId: number }> {
    // Extract search term (uses cached keywords, so fast)
    let extracted: { term: string; keywordId: number } | null = null;
    if (this.webDataService) {
      extracted = await this.webDataService.extractSearchTerm(input.url);
    } else {
      this.logger.debug(
        '[HistoryService] WebDataService not available - search term extraction disabled',
      );
    }

    // Record the visit
    const result = await this._insertVisitRecord(input);

    // Insert search term if this is a search engine URL
    if (extracted) {
      try {
        await this.addSearchTerm(
          extracted.keywordId,
          result.urlId,
          extracted.term,
        );
      } catch (error) {
        this.logger.warn(
          `[HistoryService] Failed to record search term: ${error}`,
        );
        this.report(error as Error, 'addSearchTerm');
      }
    }

    return result;
  }

  // =================================================================
  //  B. RETRIEVAL API (READ)
  // =================================================================

  /**
   * Main history view. Equivalent to Ctrl+H.
   * Uses Drizzle ORM for type-safe query building.
   */
  async queryHistory(filter: HistoryFilter): Promise<HistoryQueryResult[]> {
    // Build conditions array
    const conditions: SQL[] = [];

    if (filter.text) {
      const searchPattern = `%${filter.text}%`;
      const textCondition = or(
        like(schema.urls.title, searchPattern),
        like(schema.urls.url, searchPattern),
      );
      if (textCondition) {
        conditions.push(textCondition);
      }
    }

    if (filter.startDate) {
      conditions.push(
        gte(schema.visits.visitTime, toWebKitTimestamp(filter.startDate)),
      );
    }

    if (filter.endDate) {
      conditions.push(
        lte(schema.visits.visitTime, toWebKitTimestamp(filter.endDate)),
      );
    }

    // Build query with Drizzle
    let query = this.db
      .select({
        visitId: schema.visits.id,
        urlId: schema.urls.id,
        url: schema.urls.url,
        title: schema.urls.title,
        visitTime: schema.visits.visitTime,
        visitCount: schema.urls.visitCount,
        transition: schema.visits.transition,
      })
      .from(schema.visits)
      .innerJoin(schema.urls, eq(schema.visits.url, schema.urls.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.visits.visitTime))
      .$dynamic();

    // Apply pagination with validated values
    if (
      filter.limit != null &&
      Number.isInteger(filter.limit) &&
      filter.limit > 0
    ) {
      query = query.limit(filter.limit);
    }

    if (
      filter.offset != null &&
      Number.isInteger(filter.offset) &&
      filter.offset >= 0
    ) {
      query = query.offset(filter.offset);
    }

    const results = await query;

    return results.map((row) => ({
      visitId: row.visitId,
      urlId: row.urlId,
      url: row.url || '',
      title: row.title || 'Untitled',
      visitTime: fromWebKitTimestamp(row.visitTime),
      visitCount: row.visitCount,
      transition: row.transition,
    }));
  }

  /**
   * Get "Most Visited" sites for the New Tab Page.
   * Logic: High visit count + High typed count + Recent access.
   */
  async getTopSites(
    limit = 8,
  ): Promise<InferSelectModel<typeof schema.urls>[]> {
    return await this.db
      .select()
      .from(schema.urls)
      .where(eq(schema.urls.hidden, false))
      .orderBy(desc(schema.urls.visitCount)) // Simple heuristic
      .limit(limit);
  }

  /**
   * Drill down: Get all specific timestamps a single URL was visited.
   */
  async getVisitsForUrl(urlId: number): Promise<Date[]> {
    const results = await this.db
      .select({ time: schema.visits.visitTime })
      .from(schema.visits)
      .where(eq(schema.visits.url, urlId))
      .orderBy(desc(schema.visits.visitTime));

    return results.map((r) => fromWebKitTimestamp(r.time));
  }

  async getLastVisitTimeForOrigin(origin: string): Promise<Date | null> {
    const result = await this.db
      .select({ time: schema.visits.visitTime, url: schema.visits.url })
      .from(schema.visits)
      .innerJoin(schema.urls, eq(schema.visits.url, schema.urls.id))
      .where(like(schema.urls.url, `${origin}%`))
      .orderBy(desc(schema.visits.visitTime))
      .limit(1)
      .get();
    return result ? fromWebKitTimestamp(result.time) : null;
  }

  /**
   * Get aggregate visit stats for all URLs matching an origin prefix.
   * Returns total visit count and most recent visit time across all matching URLs.
   */
  async getVisitStatsForOrigin(origin: string): Promise<{
    visitCount: number;
    lastVisitTime: Date | null;
    lastTitle: string | null;
    lastUrl: string | null;
  }> {
    const rows = await this.db
      .select({
        url: schema.urls.url,
        title: schema.urls.title,
        visitCount: schema.urls.visitCount,
        lastVisitTime: schema.urls.lastVisitTime,
      })
      .from(schema.urls)
      .where(like(schema.urls.url, `${origin}%`));

    if (rows.length === 0) {
      return {
        visitCount: 0,
        lastVisitTime: null,
        lastTitle: null,
        lastUrl: null,
      };
    }

    let totalVisitCount = 0;
    let maxLastVisitTime: Date | null = null;
    let lastTitle: string | null = null;
    let lastUrl: string | null = null;
    for (const row of rows) {
      totalVisitCount += Number(row.visitCount);
      const time = fromWebKitTimestamp(row.lastVisitTime);
      if (!maxLastVisitTime || time > maxLastVisitTime) {
        maxLastVisitTime = time;
        lastTitle = row.title;
        lastUrl = row.url;
      }
    }

    return {
      visitCount: totalVisitCount,
      lastVisitTime: maxLastVisitTime,
      lastTitle,
      lastUrl,
    };
  }

  /**
   * Batch variant of getVisitStatsForOrigin: get the last visited URL and
   * title for multiple origins in a single query. Returns a map keyed by origin.
   */
  async getLastVisitedUrlsForOrigins(
    origins: string[],
  ): Promise<Map<string, { title: string | null; url: string }>> {
    if (origins.length === 0) return new Map();

    const conditions = origins.map((o) => like(schema.urls.url, `${o}%`));
    const rows = await this.db
      .select({
        url: schema.urls.url,
        title: schema.urls.title,
        lastVisitTime: schema.urls.lastVisitTime,
      })
      .from(schema.urls)
      .where(or(...conditions));

    // Group by origin and keep the entry with the most recent lastVisitTime
    const byOrigin = new Map<
      string,
      { title: string | null; url: string; lastVisitTime: bigint }
    >();
    for (const row of rows) {
      if (!row.url) continue;
      let origin: string;
      try {
        origin = new URL(row.url).origin;
      } catch {
        continue;
      }
      const existing = byOrigin.get(origin);
      if (!existing || row.lastVisitTime > existing.lastVisitTime) {
        byOrigin.set(origin, {
          title: row.title,
          url: row.url,
          lastVisitTime: row.lastVisitTime,
        });
      }
    }

    const result = new Map<string, { title: string | null; url: string }>();
    for (const [origin, data] of byOrigin) {
      result.set(origin, { title: data.title, url: data.url });
    }
    return result;
  }

  /**
   * Get the most visited origins, grouped by origin (scheme://host[:port]).
   * Each visit row is counted individually (not the URL-level visitCount).
   * Supports pagination via limit + offset.
   *
   * Time filtering:
   * - `timespanDays` computes the cutoff relative to the most recent visit,
   *   so the window stays meaningful even if the browser hasn't been used recently.
   * - `since` uses an absolute cutoff date.
   * - If both are set, `timespanDays` takes precedence.
   * - If neither is set, all history is considered.
   */
  async getMostVisitedOrigins(options: {
    since?: Date;
    timespanDays?: number;
    limit: number;
    offset?: number;
    minVisitCount?: number;
    excludeLocalOrigins?: boolean;
  }): Promise<OriginVisitCount[]> {
    const { limit, offset = 0, minVisitCount } = options;

    // Determine the cutoff timestamp
    let sinceTs: bigint;
    if (options.timespanDays != null) {
      const lastVisitTime = await this.getLastVisitTime();
      if (!lastVisitTime) return [];
      const sinceDate = new Date(
        lastVisitTime.getTime() - options.timespanDays * 24 * 60 * 60 * 1000,
      );
      sinceTs = toWebKitTimestamp(sinceDate);
    } else if (options.since) {
      sinceTs = toWebKitTimestamp(options.since);
    } else {
      sinceTs = 0n;
    }

    // Extract origin (scheme://host[:port]) from URL using SQLite string ops.
    // If there's a path separator after ://, take everything before it;
    // otherwise use the full URL (e.g. "https://example.com" with no trailing slash).
    const originExpr = sql<string>`CASE
      WHEN INSTR(SUBSTR(${schema.urls.url}, INSTR(${schema.urls.url}, '://') + 3), '/') > 0
      THEN SUBSTR(${schema.urls.url}, 1, INSTR(${schema.urls.url}, '://') + 2 + INSTR(SUBSTR(${schema.urls.url}, INSTR(${schema.urls.url}, '://') + 3), '/') - 1)
      ELSE ${schema.urls.url}
    END`;

    const results = await this.db
      .select({
        origin: originExpr.as('origin'),
        visitCount: sql<number>`COUNT(*)`.as('visit_count'),
        lastVisitTime: sql<bigint>`MAX(${schema.visits.visitTime})`.as(
          'last_visit_time',
        ),
      })
      .from(schema.visits)
      .innerJoin(schema.urls, eq(schema.visits.url, schema.urls.id))
      .where(
        and(
          gte(schema.visits.visitTime, sinceTs),
          sql`${schema.urls.url} IS NOT NULL`,
          ...(options.excludeLocalOrigins
            ? [
                sql`${schema.urls.url} NOT LIKE 'http://localhost%'`,
                sql`${schema.urls.url} NOT LIKE 'http://127.0.0.1%'`,
                sql`${schema.urls.url} NOT LIKE 'http://[::1]%'`,
              ]
            : []),
        ),
      )
      .groupBy(sql`origin`)
      .having(sql`COUNT(*) >= ${minVisitCount ?? 1}`)
      .orderBy(desc(sql`visit_count`))
      .limit(limit)
      .offset(offset);

    return results.map((row) => ({
      origin: row.origin || '',
      visitCount: Number(row.visitCount),
      lastVisitTime: fromWebKitTimestamp(row.lastVisitTime),
    }));
  }

  /**
   * Get the timestamp of the most recent visit in the database.
   */
  private async getLastVisitTime(): Promise<Date | null> {
    const result = await this.db
      .select({
        time: sql<bigint>`MAX(${schema.visits.visitTime})`,
      })
      .from(schema.visits)
      .get();
    return result?.time ? fromWebKitTimestamp(result.time) : null;
  }

  // =================================================================
  //  C. MAINTENANCE API (EDIT/DELETE)
  // =================================================================

  /**
   * Deletes a specific URL and all associated data.
   */
  async deleteUrl(urlId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.visits).where(eq(schema.visits.url, urlId));
      await tx
        .delete(schema.keywordSearchTerms)
        .where(eq(schema.keywordSearchTerms.urlId, urlId));
      await tx.delete(schema.segments).where(eq(schema.segments.urlId, urlId));
      await tx.delete(schema.urls).where(eq(schema.urls.id, urlId));
    });
  }

  /**
   * Delete history entries within a time range.
   */
  async deleteHistoryRange(start: Date, end: Date): Promise<void> {
    const startTs = toWebKitTimestamp(start);
    const endTs = toWebKitTimestamp(end);

    await this.db
      .delete(schema.visits)
      .where(
        and(
          gte(schema.visits.visitTime, startTs),
          lte(schema.visits.visitTime, endTs),
        ),
      );
  }

  /**
   * Clear all download history from the database.
   * @returns Number of download entries that were deleted
   */
  async clearDownloads(): Promise<number> {
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.downloads)
      .get();
    const downloadCount = countResult?.count ?? 0;

    await this.db.delete(schema.downloadsSlices);
    await this.db.delete(schema.downloadsUrlChains);
    await this.db.delete(schema.downloads);

    return downloadCount;
  }

  /**
   * Clear all history data from the database.
   * Deletes all data from all history-related tables.
   * @returns Number of URL entries that were deleted
   */
  async clearAllData(): Promise<number> {
    // Get count before deletion for return value
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.urls)
      .get();
    const urlCount = countResult?.count ?? 0;

    // Delete in order respecting foreign key relationships
    // Start with dependent tables first
    await this.db.delete(schema.clustersAndVisits);
    await this.db.delete(schema.clusterKeywords);
    await this.db.delete(schema.clusterVisitDuplicates);
    await this.db.delete(schema.clusters);
    await this.db.delete(schema.contentAnnotations);
    await this.db.delete(schema.contextAnnotations);
    await this.db.delete(schema.visitSource);
    await this.db.delete(schema.visitedLinks);
    await this.db.delete(schema.keywordSearchTerms);
    await this.db.delete(schema.segmentUsage);
    await this.db.delete(schema.segments);
    await this.db.delete(schema.visits);
    await this.db.delete(schema.urls);
    // Note: meta table is preserved (contains schema version info)

    return urlCount;
  }

  /**
   * Clear history data within a time range.
   * More thorough than deleteHistoryRange - also cleans up orphaned URLs.
   * @param start - Start of range (inclusive)
   * @param end - End of range (inclusive)
   * @returns Number of visit entries that were deleted
   */
  async clearHistoryRange(start: Date, end: Date): Promise<number> {
    const startTs = toWebKitTimestamp(start);
    const endTs = toWebKitTimestamp(end);

    // Get visit IDs in range for annotation cleanup
    const visitsInRange = await this.db
      .select({ id: schema.visits.id, url: schema.visits.url })
      .from(schema.visits)
      .where(
        and(
          gte(schema.visits.visitTime, startTs),
          lte(schema.visits.visitTime, endTs),
        ),
      );

    const visitIds = visitsInRange.map((v) => v.id);
    const affectedUrlIds = [...new Set(visitsInRange.map((v) => v.url))];
    const visitCount = visitIds.length;

    if (visitIds.length === 0) {
      return 0;
    }

    // Delete visit-related data
    await this.db
      .delete(schema.clustersAndVisits)
      .where(inArray(schema.clustersAndVisits.visitId, visitIds));
    await this.db
      .delete(schema.clusterVisitDuplicates)
      .where(inArray(schema.clusterVisitDuplicates.visitId, visitIds));
    await this.db
      .delete(schema.contentAnnotations)
      .where(inArray(schema.contentAnnotations.visitId, visitIds));
    await this.db
      .delete(schema.contextAnnotations)
      .where(inArray(schema.contextAnnotations.visitId, visitIds));
    await this.db
      .delete(schema.visitSource)
      .where(inArray(schema.visitSource.id, visitIds));

    // Delete the visits
    await this.db
      .delete(schema.visits)
      .where(
        and(
          gte(schema.visits.visitTime, startTs),
          lte(schema.visits.visitTime, endTs),
        ),
      );

    // Clean up orphaned URLs (URLs with no remaining visits)
    for (const urlId of affectedUrlIds) {
      const remainingVisits = await this.db
        .select({ id: schema.visits.id })
        .from(schema.visits)
        .where(eq(schema.visits.url, urlId))
        .limit(1)
        .get();

      if (!remainingVisits) {
        // No visits left for this URL, delete it and related data
        await this.db
          .delete(schema.keywordSearchTerms)
          .where(eq(schema.keywordSearchTerms.urlId, urlId));
        await this.db
          .delete(schema.segments)
          .where(eq(schema.segments.urlId, urlId));
        await this.db.delete(schema.urls).where(eq(schema.urls.id, urlId));
      }
    }

    // Clean up orphaned clusters (clusters with no visits)
    await this.dbDriver.execute(`
      DELETE FROM clusters
      WHERE cluster_id NOT IN (SELECT DISTINCT cluster_id FROM clusters_and_visits)
    `);

    return visitCount;
  }

  /**
   * Run VACUUM to reclaim disk space after large deletions.
   */
  async vacuum(): Promise<void> {
    await this.dbDriver.execute('VACUUM');
  }

  // =================================================================
  //  D. OMNIBOX SUGGESTIONS API
  // =================================================================

  /**
   * Query history entries for omnibox suggestions.
   * Case-insensitive contains search on URL and title, sorted by recency and URL length.
   * All words must match (AND logic) with %LIKE% pattern.
   * Limits results to max N per host.
   */
  async queryHistoryForOmnibox(options: {
    text: string;
    limit?: number;
    maxPerHost?: number;
  }): Promise<
    {
      url: string;
      title: string;
      visitCount: number;
      lastVisitTime: Date;
    }[]
  > {
    const { text, limit = 5, maxPerHost = 2 } = options;

    // Split into words and create %LIKE% patterns for each
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return [];
    }

    // Build conditions: each word must match in URL OR title (AND between words)
    const wordConditions = words.map((word) => {
      const pattern = `%${word}%`;
      return or(
        sql`LOWER(${schema.urls.url}) LIKE ${pattern}`,
        sql`LOWER(${schema.urls.title}) LIKE ${pattern}`,
      );
    });

    // Fetch more rows than needed to apply per-host filtering
    const results = await this.db
      .select({
        url: schema.urls.url,
        title: schema.urls.title,
        visitCount: schema.urls.visitCount,
        lastVisitTime: schema.urls.lastVisitTime,
      })
      .from(schema.urls)
      .where(and(eq(schema.urls.hidden, false), ...wordConditions))
      .orderBy(desc(schema.urls.lastVisitTime), sql`LENGTH(${schema.urls.url})`)
      .limit(limit * 10); // Fetch extra to allow for per-host filtering

    // Apply max-per-host filtering
    const hostCounts = new Map<string, number>();
    const filtered: typeof results = [];

    for (const row of results) {
      if (!row.url) continue;

      // Extract hostname, falling back to the URL itself on parse errors
      let hostname: string;
      try {
        hostname = new URL(row.url).hostname;
      } catch {
        hostname = row.url;
      }

      const count = hostCounts.get(hostname) || 0;
      if (count < maxPerHost) {
        hostCounts.set(hostname, count + 1);
        filtered.push(row);
        if (filtered.length >= limit) break;
      }
    }

    return filtered.map((row) => ({
      url: row.url || '',
      title: row.title || '',
      visitCount: row.visitCount,
      lastVisitTime: fromWebKitTimestamp(row.lastVisitTime),
    }));
  }

  /**
   * Query search terms for omnibox suggestions.
   * Case-insensitive %LIKE% search on normalized term.
   * All words must match (AND logic).
   */
  async querySearchTermsForOmnibox(
    text: string,
    limit = 5,
  ): Promise<{ term: string; keywordId: number }[]> {
    // Split into words and create %LIKE% patterns for each
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return [];
    }

    // Build conditions: each word must match in normalizedTerm (AND between words)
    const wordConditions = words.map((word) => {
      const pattern = `%${word}%`;
      return like(schema.keywordSearchTerms.normalizedTerm, pattern);
    });

    const results = await this.db
      .selectDistinct({
        term: schema.keywordSearchTerms.term,
        keywordId: schema.keywordSearchTerms.keywordId,
      })
      .from(schema.keywordSearchTerms)
      .where(and(...wordConditions))
      .limit(limit);

    return results.map((row) => ({
      term: row.term,
      keywordId: row.keywordId,
    }));
  }

  /**
   * Get most visited pages within the last N navigations for omnibox defaults.
   * Returns max 2 URLs per host, sorted by visit count (descending) then URL length (ascending).
   */
  async getMostVisitedPagesForOmnibox(options?: {
    navigationLimit?: number;
    resultLimit?: number;
    maxPerHost?: number;
  }): Promise<
    {
      url: string;
      title: string;
      visitCount: number;
      lastVisitTime: Date;
    }[]
  > {
    const {
      navigationLimit = 500,
      resultLimit = 8,
      maxPerHost = 2,
    } = options ?? {};

    // Get the last N visits and count occurrences per URL within that window
    const recentVisits = await this.db
      .select({
        urlId: schema.visits.url,
        visitCount: sql<number>`COUNT(*)`.as('visit_count'),
        lastVisitTime: sql<bigint>`MAX(${schema.visits.visitTime})`.as(
          'last_visit_time',
        ),
      })
      .from(schema.visits)
      .groupBy(schema.visits.url)
      .orderBy(desc(sql`MAX(${schema.visits.visitTime})`))
      .limit(navigationLimit);

    if (recentVisits.length === 0) {
      return [];
    }

    // Get URL details for these visits
    const urlIds = recentVisits.map((v) => v.urlId);
    const urlDetails = await this.db
      .select({
        id: schema.urls.id,
        url: schema.urls.url,
        title: schema.urls.title,
      })
      .from(schema.urls)
      .where(
        and(eq(schema.urls.hidden, false), inArray(schema.urls.id, urlIds)),
      );

    // Create a map for quick lookup
    const urlMap = new Map(urlDetails.map((u) => [u.id, u]));

    // Combine and sort by visit count (desc), then URL length (asc)
    const combined = recentVisits
      .filter((v) => urlMap.has(v.urlId))
      .map((v) => {
        const urlInfo = urlMap.get(v.urlId)!;
        return {
          url: urlInfo.url || '',
          title: urlInfo.title || '',
          visitCount: Number(v.visitCount),
          lastVisitTime: v.lastVisitTime,
        };
      })
      .sort((a, b) => {
        // Primary: visit count descending
        if (b.visitCount !== a.visitCount) {
          return b.visitCount - a.visitCount;
        }
        // Secondary: URL length ascending
        return a.url.length - b.url.length;
      });

    // Apply max-per-host filtering
    const hostCounts = new Map<string, number>();
    const filtered: typeof combined = [];

    for (const row of combined) {
      if (!row.url) continue;

      let hostname: string;
      try {
        hostname = new URL(row.url).hostname;
      } catch {
        hostname = row.url;
      }

      const count = hostCounts.get(hostname) || 0;
      if (count < maxPerHost) {
        hostCounts.set(hostname, count + 1);
        filtered.push(row);
        if (filtered.length >= resultLimit) break;
      }
    }

    return filtered.map((row) => ({
      url: row.url,
      title: row.title,
      visitCount: row.visitCount,
      lastVisitTime: fromWebKitTimestamp(row.lastVisitTime),
    }));
  }

  /**
   * Get frequently searched terms (searched multiple times within a time window).
   * Returns search terms that have been used more than once.
   */
  async getFrequentSearchTermsForOmnibox(options?: {
    dayWindow?: number;
    minOccurrences?: number;
    limit?: number;
  }): Promise<{ term: string; keywordId: number; occurrences: number }[]> {
    const { dayWindow = 7, minOccurrences = 2, limit = 5 } = options ?? {};

    // Calculate the cutoff timestamp
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - dayWindow);
    const cutoffTimestamp = toWebKitTimestamp(cutoffDate);

    // Query search terms joined with urls to filter by recent visits
    // Group by normalized term and count occurrences
    const results = await this.db
      .select({
        term: schema.keywordSearchTerms.term,
        normalizedTerm: schema.keywordSearchTerms.normalizedTerm,
        keywordId: schema.keywordSearchTerms.keywordId,
        occurrences: sql<number>`COUNT(*)`.as('occurrences'),
      })
      .from(schema.keywordSearchTerms)
      .innerJoin(
        schema.urls,
        eq(schema.keywordSearchTerms.urlId, schema.urls.id),
      )
      .where(gte(schema.urls.lastVisitTime, cutoffTimestamp))
      .groupBy(schema.keywordSearchTerms.normalizedTerm)
      .having(sql`COUNT(*) >= ${minOccurrences}`)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(limit);

    return results.map((row) => ({
      term: row.term,
      keywordId: row.keywordId,
      occurrences: Number(row.occurrences),
    }));
  }
}
