import type { Logger } from '../logger';
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
import * as schema from './schema';
import { drizzle } from 'drizzle-orm/libsql';
import type { GlobalDataPathService } from '../global-data-path';
import path from 'node:path';
import { createClient } from '@libsql/client';
import {
  PageTransition,
  type VisitInput,
  type DownloadStartInput,
  type HistoryFilter,
} from '@shared/karton-contracts/pages-api/types';
import { toWebKitTimestamp, fromWebKitTimestamp } from '../chrome-db-utils';
import startScript from './start-script.sql?raw';

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

/**
 * Service responsible for managing browsing history.
 */
export class HistoryService {
  private logger: Logger;
  private dbDriver;
  private db;

  private constructor(logger: Logger, paths: GlobalDataPathService) {
    this.logger = logger;
    const dbPath = path.join(paths.globalDataPath, 'History');
    this.dbDriver = createClient({
      url: `file:${dbPath}`,
      intMode: 'bigint', // WebKit timestamps exceed Number.MAX_SAFE_INTEGER
    });
    this.db = drizzle(this.dbDriver, {
      schema,
    });
  }

  public static async create(
    logger: Logger,
    globalDataPathService: GlobalDataPathService,
  ): Promise<HistoryService> {
    const instance = new HistoryService(logger, globalDataPathService);
    await instance.initialize();
    logger.debug('[HistoryService] Created service');
    return instance;
  }

  private async initialize(): Promise<void> {
    this.logger.debug('[HistoryService] Initializing...');

    await this.dbDriver.executeMultiple(startScript);

    this.logger.debug('[HistoryService] Initialized');
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
   * Records a page visit. Creates or updates URL entry, then inserts visit record.
   */
  async addVisit(input: VisitInput): Promise<number> {
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
        urlId = existingUrl.id;
        await tx
          .update(schema.urls)
          .set({
            visitCount: existingUrl.visitCount + 1,
            lastVisitTime: now,
            title: input.title || existingUrl.title,
            typedCount:
              input.transition === PageTransition.TYPED
                ? existingUrl.typedCount + 1
                : existingUrl.typedCount,
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
        urlId = result[0].id;
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

      const visitId = visitResult[0].id;

      // Mark source if synced
      if (input.isLocal === false) {
        await tx.insert(schema.visitSource).values({
          id: visitId,
          source: 1,
        });
      }

      return visitId;
    });
  }

  /**
   * Log a search term that resulted in a click (for Omnibox suggestions).
   */
  async addSearchTerm(term: string, targetUrlId: number): Promise<void> {
    // Usually mapped to a keyword_id, simplified here to raw insert
    // In a real app, you'd check `keywords` table first.
    await this.db.insert(schema.keywordSearchTerms).values({
      keywordId: 0, // Placeholder
      urlId: targetUrlId,
      term: term,
      normalizedTerm: term.toLowerCase().trim(),
    });
  }

  /**
   * Start tracking a file download.
   */
  async startDownload(input: DownloadStartInput): Promise<number> {
    const id = Math.floor(Math.random() * 1000000);
    const now = input.startTime
      ? toWebKitTimestamp(input.startTime)
      : toWebKitTimestamp(new Date());

    await this.db.insert(schema.downloads).values({
      id,
      guid: input.guid,
      currentPath: `${input.targetPath}.crdownload`,
      targetPath: input.targetPath,
      startTime: now,
      totalBytes: input.totalBytes,
      receivedBytes: 0,
      state: 0,
      dangerType: 0,
      interruptReason: 0,
      hash: Buffer.from([]),
      endTime: 0n,
      opened: false,
      lastAccessTime: now,
      transient: false,
      referrer: '',
      siteUrl: input.url,
      embedderDownloadData: '',
      tabUrl: input.url,
      tabReferrerUrl: '',
      httpMethod: 'GET',
      byExtId: '',
      byExtName: '',
      byWebAppId: '',
      etag: '',
      lastModified: '',
      mimeType: input.mimeType,
      originalMimeType: input.mimeType,
    });
    return id;
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
   * Clear all download history.
   * @returns Number of downloads cleared
   */
  async clearDownloads(): Promise<number> {
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.downloads)
      .get();
    const count = countResult?.count ?? 0;

    await this.db.delete(schema.downloadsSlices);
    await this.db.delete(schema.downloadsUrlChains);
    await this.db.delete(schema.downloads);

    return count;
  }

  /**
   * Run VACUUM to reclaim disk space after large deletions.
   */
  async vacuum(): Promise<void> {
    await this.dbDriver.execute('VACUUM');
  }
}
