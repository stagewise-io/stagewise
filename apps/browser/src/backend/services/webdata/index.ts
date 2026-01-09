import type { Logger } from '../logger';
import { eq, sql } from 'drizzle-orm';
import * as schema from './schema';
import { drizzle } from 'drizzle-orm/libsql';
import type { GlobalDataPathService } from '../global-data-path';
import path from 'node:path';
import { createClient } from '@libsql/client';
import startScript from './start-script.sql?raw';
import type { SearchEngine } from '@shared/karton-contracts/ui/shared-types';

/**
 * Result of extracting a search term from a URL.
 */
export interface ExtractedSearchTerm {
  /** The search term entered by the user */
  term: string;
  /** The keyword ID (references keywords.id in Web Data DB) */
  keywordId: number;
}

/** Cached keyword entry for search term extraction */
interface CachedKeyword {
  id: number;
  shortName: string;
  keyword: string;
  url: string;
}

/** Cache duration for keywords (5 minutes) */
const KEYWORDS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Service responsible for managing web data (search engines/keywords).
 * Uses a separate database file matching Chrome's Web Data schema.
 */
export class WebDataService {
  private logger: Logger;
  private dbDriver;
  private db;

  /** Cached keywords to avoid DB queries on every URL check */
  private keywordsCache: CachedKeyword[] | null = null;
  private keywordsCacheExpiry = 0;

  private constructor(logger: Logger, paths: GlobalDataPathService) {
    this.logger = logger;
    const dbPath = path.join(paths.globalDataPath, 'Web Data');
    this.dbDriver = createClient({
      url: `file:${dbPath}`,
      intMode: 'bigint',
    });
    this.db = drizzle(this.dbDriver, { schema });
  }

  public static async create(
    logger: Logger,
    globalDataPathService: GlobalDataPathService,
  ): Promise<WebDataService> {
    const instance = new WebDataService(logger, globalDataPathService);
    await instance.initialize();
    logger.debug('[WebDataService] Created service');
    return instance;
  }

  private async initialize(): Promise<void> {
    this.logger.debug('[WebDataService] Initializing...');
    await this.dbDriver.executeMultiple(startScript);
    this.logger.debug('[WebDataService] Initialized');
  }

  public teardown(): void {
    this.keywordsCache = null;
    this.keywordsCacheExpiry = 0;
    this.dbDriver.close();
    this.logger.debug('[WebDataService] Shutdown complete');
  }

  /**
   * Invalidates the keywords cache, forcing a refresh on next access.
   * Call this after adding/updating keywords.
   */
  public invalidateKeywordsCache(): void {
    this.keywordsCache = null;
    this.keywordsCacheExpiry = 0;
  }

  // =================================================================
  //  KEYWORDS API
  // =================================================================

  /**
   * Get keyword ID for a hostname (e.g., 'google.com' -> 1).
   * Matches against the 'keyword' field in the keywords table.
   */
  async getKeywordIdForHostname(hostname: string): Promise<number | null> {
    // Normalize hostname (remove 'www.' prefix for matching)
    const normalizedHostname = hostname.replace(/^www\./, '');

    const result = await this.db
      .select({ id: schema.keywords.id })
      .from(schema.keywords)
      .where(eq(schema.keywords.keyword, normalizedHostname))
      .get();

    // Convert bigint to number safely (IDs are always small integers)
    return result?.id != null ? Number(result.id) : null;
  }

  /**
   * Get all registered search engine keywords.
   * Results are cached for performance (keywords rarely change).
   */
  async getAllKeywords(): Promise<CachedKeyword[]> {
    // Return cached results if still valid
    if (this.keywordsCache && Date.now() < this.keywordsCacheExpiry) {
      return this.keywordsCache;
    }

    const results = await this.db
      .select({
        id: schema.keywords.id,
        shortName: schema.keywords.shortName,
        keyword: schema.keywords.keyword,
        url: schema.keywords.url,
      })
      .from(schema.keywords);

    // Convert bigint IDs to numbers and cache
    this.keywordsCache = results.map((r) => ({
      id: Number(r.id),
      shortName: r.shortName,
      keyword: r.keyword,
      url: r.url,
    }));
    this.keywordsCacheExpiry = Date.now() + KEYWORDS_CACHE_TTL_MS;

    this.logger.debug(
      `[WebDataService] Cached ${this.keywordsCache.length} keywords`,
    );

    return this.keywordsCache;
  }

  /**
   * Get a keyword entry by ID.
   */
  async getKeywordById(
    id: number,
  ): Promise<typeof schema.keywords.$inferSelect | null> {
    const result = await this.db
      .select()
      .from(schema.keywords)
      .where(eq(schema.keywords.id, id))
      .get();

    return result ?? null;
  }

  /**
   * Increment usage count for a keyword.
   */
  async incrementUsageCount(keywordId: number): Promise<void> {
    const keyword = await this.getKeywordById(keywordId);
    if (keyword) {
      await this.db
        .update(schema.keywords)
        .set({
          usageCount: (keyword.usageCount ?? 0) + 1,
          lastVisited: Math.floor(Date.now() / 1000),
        })
        .where(eq(schema.keywords.id, keywordId));
    }
  }

  // =================================================================
  //  SEARCH TERM EXTRACTION
  // =================================================================

  /** Maximum length for stored search terms (prevents DB bloat from malformed URLs) */
  private static readonly MAX_SEARCH_TERM_LENGTH = 1000;

  /**
   * Minimum ID for user-added search engines.
   * Using a high value to avoid conflicts with future built-in engines.
   */
  private static readonly CUSTOM_ENGINE_ID_START = 10000;

  /**
   * Extracts the query parameter name from a URL template.
   * E.g., 'https://google.com/search?q={searchTerms}' -> 'q'
   *
   * Handles various template formats:
   * - Standard: ?q={searchTerms}
   * - With other params: ?client=chrome&q={searchTerms}
   * - URL-encoded placeholder: ?q=%7BsearchTerms%7D
   */
  private extractQueryParamFromTemplate(urlTemplate: string): string | null {
    // First try to decode the template in case {searchTerms} is URL-encoded
    let template = urlTemplate;
    try {
      // Only decode if it contains encoded characters
      if (template.includes('%7B') || template.includes('%7b')) {
        template = decodeURIComponent(template);
      }
    } catch {
      // Ignore decode errors, use original
    }

    // Match parameter name before {searchTerms} placeholder
    // Handles both ? and & prefixes, and captures the param name
    const match = template.match(/[?&]([^=&]+)=\{searchTerms\}/i);
    return match ? match[1] : null;
  }

  /**
   * Checks if a hostname matches a keyword entry.
   * Handles www. prefix and country-specific TLDs (e.g., google.co.uk matches google.com).
   */
  private hostnameMatchesKeyword(hostname: string, keyword: string): boolean {
    // Normalize: remove www. prefix and convert to lowercase
    const normalizedHostname = hostname.replace(/^www\./, '').toLowerCase();
    const normalizedKeyword = keyword.replace(/^www\./, '').toLowerCase();

    // Exact match
    if (normalizedHostname === normalizedKeyword) {
      return true;
    }

    // Extract the registrable domain name (e.g., "google" from "google.co.uk")
    const getRegistrableName = (host: string): string | null => {
      const parts = host.split('.');
      if (parts.length < 2) {
        return null; // Invalid hostname
      }

      // Common second-level domains that indicate the registrable name is one level up
      // This covers most common ccTLD patterns like .co.uk, .com.au, .org.uk, etc.
      const secondLevelDomains = new Set([
        'co',
        'com',
        'org',
        'net',
        'edu',
        'gov',
        'ac',
        'or',
        'ne',
        'go',
        'gob',
        'nic',
        'mil',
      ]);

      const tld = parts[parts.length - 1];
      const sld = parts[parts.length - 2];

      // Check if this looks like a ccTLD with second-level domain (e.g., .co.uk)
      // ccTLDs are typically 2 characters
      if (
        tld.length === 2 &&
        secondLevelDomains.has(sld) &&
        parts.length >= 3
      ) {
        return parts[parts.length - 3];
      }

      // Standard domain (e.g., google.com)
      return sld;
    };

    const hostName = getRegistrableName(normalizedHostname);
    const keywordName = getRegistrableName(normalizedKeyword);

    // Both must have valid registrable names and they must match
    return (
      hostName !== null && keywordName !== null && hostName === keywordName
    );
  }

  /**
   * Checks if a URL path looks like a search results page.
   * This prevents false positives from homepages with query params.
   */
  private isSearchPath(url: URL, urlTemplate: string): boolean {
    // Extract path from template
    try {
      const templateUrl = new URL(urlTemplate.replace('{searchTerms}', 'test'));
      const templatePath = templateUrl.pathname;

      // If template has a specific path (like /search), check for it
      if (templatePath && templatePath !== '/') {
        return (
          url.pathname === templatePath || url.pathname.startsWith(templatePath)
        );
      }

      // Template uses root path - allow if query param present
      return true;
    } catch {
      return true; // If template parsing fails, fall back to allowing
    }
  }

  /**
   * Extracts search term from a URL if it matches a known search engine.
   * Uses cached keywords for performance.
   *
   * @param url The URL to check
   * @returns The extracted search term and keyword ID, or null if not a search URL
   */
  async extractSearchTerm(url: string): Promise<ExtractedSearchTerm | null> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    // Skip non-http(s) URLs (e.g., file://, chrome://)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    // Skip IP addresses and localhost
    if (
      parsed.hostname === 'localhost' ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname) ||
      parsed.hostname === '[::1]'
    ) {
      return null;
    }

    const keywords = await this.getAllKeywords();

    for (const keyword of keywords) {
      if (this.hostnameMatchesKeyword(parsed.hostname, keyword.keyword)) {
        // Check if it's a valid search path
        if (!this.isSearchPath(parsed, keyword.url)) {
          continue;
        }

        // Extract query param name from the template
        const queryParam = this.extractQueryParamFromTemplate(keyword.url);
        if (!queryParam) {
          continue;
        }

        // Get the search term
        const searchTerm = parsed.searchParams.get(queryParam);
        if (searchTerm?.trim()) {
          // Truncate overly long search terms to prevent DB bloat
          let term = searchTerm.trim();
          if (term.length > WebDataService.MAX_SEARCH_TERM_LENGTH) {
            term = term.substring(0, WebDataService.MAX_SEARCH_TERM_LENGTH);
          }

          return {
            term,
            keywordId: keyword.id,
          };
        }
      }
    }

    return null;
  }

  // =================================================================
  //  SEARCH ENGINE CRUD (for settings UI)
  // =================================================================

  /**
   * Get all search engines formatted for UI display.
   * Built-in engines are identified by prepopulate_id > 0.
   */
  async getSearchEngines(): Promise<SearchEngine[]> {
    const results = await this.db
      .select({
        id: schema.keywords.id,
        shortName: schema.keywords.shortName,
        keyword: schema.keywords.keyword,
        url: schema.keywords.url,
        faviconUrl: schema.keywords.faviconUrl,
        prepopulateId: schema.keywords.prepopulateId,
      })
      .from(schema.keywords);

    return results.map((r) => ({
      id: Number(r.id),
      shortName: r.shortName,
      keyword: r.keyword,
      url: r.url,
      faviconUrl: r.faviconUrl,
      isBuiltIn: (r.prepopulateId ?? 0) > 0,
    }));
  }

  /**
   * Add a new custom search engine.
   * @param input The search engine details (URL should use {searchTerms} placeholder internally)
   * @returns The ID of the newly created search engine
   */
  async addSearchEngine(input: {
    name: string;
    url: string; // Expected to be in {searchTerms} format
    keyword: string;
  }): Promise<number> {
    // Find the maximum ID and ensure we use at least CUSTOM_ENGINE_ID_START
    // Note: Database uses intMode: 'bigint', so we need to convert to number
    const maxIdResult = await this.db
      .select({ maxId: sql<bigint>`MAX(id)` })
      .from(schema.keywords)
      .get();

    const currentMaxId = maxIdResult?.maxId ? Number(maxIdResult.maxId) : 0;
    const newId = Math.max(
      currentMaxId + 1,
      WebDataService.CUSTOM_ENGINE_ID_START,
    );

    // Extract favicon URL from the search engine URL
    let faviconUrl = '';
    try {
      const parsedUrl = new URL(input.url.replace('{searchTerms}', 'test'));
      faviconUrl = `${parsedUrl.origin}/favicon.ico`;
    } catch {
      // If URL parsing fails, leave faviconUrl empty
    }

    await this.db.insert(schema.keywords).values({
      id: newId,
      shortName: input.name,
      keyword: input.keyword,
      url: input.url,
      faviconUrl,
      safeForAutoreplace: 0,
      inputEncodings: 'UTF-8',
      prepopulateId: 0, // Custom engine, not built-in
      dateCreated: Math.floor(Date.now() / 1000),
      syncGuid: '',
      alternateUrls: '[]',
    });

    // Invalidate cache so the new engine appears in getAllKeywords
    this.invalidateKeywordsCache();

    this.logger.info(`[WebDataService] Added search engine: ${input.name}`, {
      id: newId,
      keyword: input.keyword,
    });

    return newId;
  }

  /**
   * Remove a search engine by ID.
   * @throws Error if the engine is a built-in engine (prepopulate_id > 0)
   * @returns true if removed, false if not found
   */
  async removeSearchEngine(id: number): Promise<boolean> {
    // First check if the engine exists and whether it's built-in
    const engine = await this.db
      .select({
        prepopulateId: schema.keywords.prepopulateId,
        shortName: schema.keywords.shortName,
      })
      .from(schema.keywords)
      .where(eq(schema.keywords.id, id))
      .get();

    if (!engine) {
      return false;
    }

    // Prevent deletion of built-in engines
    if ((engine.prepopulateId ?? 0) > 0) {
      throw new Error('Cannot delete built-in search engines');
    }

    await this.db.delete(schema.keywords).where(eq(schema.keywords.id, id));

    // Invalidate cache
    this.invalidateKeywordsCache();

    this.logger.info(
      `[WebDataService] Removed search engine: ${engine.shortName}`,
      { id },
    );

    return true;
  }
}
