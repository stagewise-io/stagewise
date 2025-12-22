import type { Logger } from '../logger';
import { eq, and, inArray } from 'drizzle-orm';
import * as schema from './schema';
import { drizzle } from 'drizzle-orm/libsql';
import type { GlobalDataPathService } from '../global-data-path';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { net } from 'electron';
import { toWebKitTimestamp } from '../chrome-db-utils';
import type { FaviconBitmapResult } from '@shared/karton-contracts/pages-api/types';
import startScript from './start-script.sql?raw';

// Icon types matching Chrome
export const IconType = {
  FAVICON: 1,
  TOUCH_ICON: 2,
  TOUCH_PRECOMPOSED_ICON: 4,
  WEB_MANIFEST_ICON: 8,
} as const;

export interface FaviconResult {
  pageUrl: string;
  faviconUrl: string | null;
  iconId: number | null;
}

// Re-export FaviconBitmapResult for consumers that import from this module
export type { FaviconBitmapResult };

/**
 * Service responsible for managing favicons.
 * Uses a separate database file matching Chrome's Favicons schema.
 */
export class FaviconService {
  private logger: Logger;
  private dbDriver;
  private db;

  private constructor(logger: Logger, paths: GlobalDataPathService) {
    this.logger = logger;
    const dbPath = path.join(paths.globalDataPath, 'Favicons');
    this.dbDriver = createClient({
      url: `file:${dbPath}`,
      intMode: 'bigint',
    });
    this.db = drizzle(this.dbDriver, { schema });
  }

  public static async create(
    logger: Logger,
    globalDataPathService: GlobalDataPathService,
  ): Promise<FaviconService> {
    const instance = new FaviconService(logger, globalDataPathService);
    await instance.initialize();
    logger.debug('[FaviconService] Created service');
    return instance;
  }

  private async initialize(): Promise<void> {
    this.logger.debug('[FaviconService] Initializing...');
    await this.dbDriver.executeMultiple(startScript);
    this.logger.debug('[FaviconService] Initialized');
  }

  public teardown(): void {
    this.logger.debug('[FaviconService] Shutdown complete');
  }

  // =================================================================
  //  STORAGE API
  // =================================================================

  /**
   * Store a favicon for a page URL.
   * Fetches the favicon image if not already cached.
   */
  async storeFavicon(
    pageUrl: string,
    faviconUrl: string,
    iconType: number = IconType.FAVICON,
  ): Promise<void> {
    const now = toWebKitTimestamp(new Date());

    await this.db.transaction(async (tx) => {
      // Find or create the favicon entry
      const faviconEntry = await tx
        .select()
        .from(schema.favicons)
        .where(eq(schema.favicons.url, faviconUrl))
        .get();

      let iconId: number;

      if (!faviconEntry) {
        // Create new favicon entry
        const result = await tx
          .insert(schema.favicons)
          .values({
            url: faviconUrl,
            iconType,
          })
          .returning({ id: schema.favicons.id });
        iconId = result[0].id;

        // Fetch and store the bitmap
        try {
          const imageData = await this.fetchFaviconImage(faviconUrl);
          if (imageData) {
            await tx.insert(schema.faviconBitmaps).values({
              iconId,
              lastUpdated: now,
              imageData: imageData.buffer,
              width: imageData.width,
              height: imageData.height,
              lastRequested: now,
            });
          }
        } catch (_err) {
          this.logger.debug(
            `[FaviconService] Failed to fetch favicon: ${faviconUrl}`,
          );
        }
      } else {
        iconId = faviconEntry.id;
      }

      // Update or create the icon mapping
      const existingMapping = await tx
        .select()
        .from(schema.iconMapping)
        .where(eq(schema.iconMapping.pageUrl, pageUrl))
        .get();

      if (existingMapping) {
        await tx
          .update(schema.iconMapping)
          .set({ iconId })
          .where(eq(schema.iconMapping.id, existingMapping.id));
      } else {
        await tx.insert(schema.iconMapping).values({
          pageUrl,
          iconId,
          pageUrlType: 0,
        });
      }
    });
  }

  /**
   * Store multiple favicons for a page URL (Chrome can have multiple).
   * Uses the first valid one.
   */
  async storeFavicons(pageUrl: string, faviconUrls: string[]): Promise<void> {
    if (faviconUrls.length === 0) return;

    // Store the first favicon URL (typically the best one)
    // Chrome prioritizes: 32x32 > 16x16 > others
    await this.storeFavicon(pageUrl, faviconUrls[0]);
  }

  // =================================================================
  //  RETRIEVAL API
  // =================================================================

  /**
   * Get favicon URLs for multiple page URLs efficiently.
   * Returns mapping without loading bitmap data.
   */
  async getFaviconsForUrls(pageUrls: string[]): Promise<Map<string, string>> {
    if (pageUrls.length === 0) return new Map();

    const results = await this.db
      .select({
        pageUrl: schema.iconMapping.pageUrl,
        faviconUrl: schema.favicons.url,
      })
      .from(schema.iconMapping)
      .innerJoin(
        schema.favicons,
        eq(schema.iconMapping.iconId, schema.favicons.id),
      )
      .where(inArray(schema.iconMapping.pageUrl, pageUrls));

    const map = new Map<string, string>();
    for (const row of results) {
      map.set(row.pageUrl, row.faviconUrl);
    }
    return map;
  }

  /**
   * Get favicon URL for a single page URL.
   */
  async getFaviconForUrl(pageUrl: string): Promise<string | null> {
    const result = await this.db
      .select({ faviconUrl: schema.favicons.url })
      .from(schema.iconMapping)
      .innerJoin(
        schema.favicons,
        eq(schema.iconMapping.iconId, schema.favicons.id),
      )
      .where(eq(schema.iconMapping.pageUrl, pageUrl))
      .get();

    return result?.faviconUrl ?? null;
  }

  /**
   * Get favicon bitmap data for a single favicon URL.
   * Returns base64-encoded image data.
   */
  async getFaviconBitmap(
    faviconUrl: string,
    preferredSize?: number,
  ): Promise<FaviconBitmapResult | null> {
    const now = toWebKitTimestamp(new Date());

    // Find the favicon
    const favicon = await this.db
      .select()
      .from(schema.favicons)
      .where(eq(schema.favicons.url, faviconUrl))
      .get();

    if (!favicon) return null;

    // Get bitmap, preferring the requested size or smallest available
    type BitmapRow = typeof schema.faviconBitmaps.$inferSelect;
    let bitmap: BitmapRow | undefined;

    if (preferredSize) {
      bitmap = await this.db
        .select()
        .from(schema.faviconBitmaps)
        .where(
          and(
            eq(schema.faviconBitmaps.iconId, favicon.id),
            eq(schema.faviconBitmaps.width, preferredSize),
          ),
        )
        .get();
    }

    if (!bitmap) {
      // Get the smallest available bitmap (most efficient for history view)
      bitmap = await this.db
        .select()
        .from(schema.faviconBitmaps)
        .where(eq(schema.faviconBitmaps.iconId, favicon.id))
        .orderBy(schema.faviconBitmaps.width)
        .get();
    }

    if (!bitmap?.imageData) return null;

    // Update last_requested timestamp
    await this.db
      .update(schema.faviconBitmaps)
      .set({ lastRequested: now })
      .where(eq(schema.faviconBitmaps.id, bitmap.id));

    return {
      faviconUrl,
      imageData: Buffer.from(bitmap.imageData).toString('base64'),
      width: bitmap.width,
      height: bitmap.height,
    };
  }

  /**
   * Get favicon bitmaps for multiple favicon URLs efficiently.
   * Returns map of faviconUrl -> base64 image data.
   */
  async getFaviconBitmaps(
    faviconUrls: string[],
  ): Promise<Map<string, FaviconBitmapResult>> {
    if (faviconUrls.length === 0) return new Map();

    const now = toWebKitTimestamp(new Date());
    const results = new Map<string, FaviconBitmapResult>();

    // Get all favicons
    const favicons = await this.db
      .select()
      .from(schema.favicons)
      .where(inArray(schema.favicons.url, faviconUrls));

    if (favicons.length === 0) return results;

    const iconIds = favicons.map((f) => f.id);
    const faviconUrlById = new Map(favicons.map((f) => [f.id, f.url]));

    // Get smallest bitmap for each icon
    const bitmaps = await this.db
      .select()
      .from(schema.faviconBitmaps)
      .where(inArray(schema.faviconBitmaps.iconId, iconIds));

    // Group by iconId and pick smallest
    const bitmapByIconId = new Map<number, (typeof bitmaps)[0]>();
    for (const bitmap of bitmaps) {
      const existing = bitmapByIconId.get(bitmap.iconId);
      if (!existing || bitmap.width < existing.width) {
        bitmapByIconId.set(bitmap.iconId, bitmap);
      }
    }

    // Build results
    for (const [iconId, bitmap] of bitmapByIconId) {
      const faviconUrl = faviconUrlById.get(iconId);
      if (faviconUrl && bitmap.imageData) {
        results.set(faviconUrl, {
          faviconUrl,
          imageData: Buffer.from(bitmap.imageData).toString('base64'),
          width: bitmap.width,
          height: bitmap.height,
        });
      }
    }

    // Update last_requested for accessed bitmaps
    const accessedBitmapIds = Array.from(bitmapByIconId.values()).map(
      (b) => b.id,
    );
    if (accessedBitmapIds.length > 0) {
      await this.db
        .update(schema.faviconBitmaps)
        .set({ lastRequested: now })
        .where(inArray(schema.faviconBitmaps.id, accessedBitmapIds));
    }

    return results;
  }

  /**
   * Get favicon bitmap directly for a page URL.
   * Convenience method that combines lookup + bitmap fetch.
   */
  async getFaviconBitmapForPage(
    pageUrl: string,
  ): Promise<FaviconBitmapResult | null> {
    const faviconUrl = await this.getFaviconForUrl(pageUrl);
    if (!faviconUrl) return null;
    return this.getFaviconBitmap(faviconUrl);
  }

  // =================================================================
  //  MAINTENANCE API
  // =================================================================

  /**
   * Delete orphaned favicons (not referenced by any page).
   */
  async cleanupOrphanedFavicons(): Promise<number> {
    // Find favicons with no icon_mapping references
    const orphanedFavicons = await this.dbDriver.execute(`
      SELECT f.id FROM favicons f
      LEFT JOIN icon_mapping im ON im.icon_id = f.id
      WHERE im.id IS NULL
    `);

    const orphanedIds = orphanedFavicons.rows.map((r: any) => Number(r.id));
    if (orphanedIds.length === 0) return 0;

    // Delete bitmaps first
    await this.db
      .delete(schema.faviconBitmaps)
      .where(inArray(schema.faviconBitmaps.iconId, orphanedIds));

    // Delete favicons
    await this.db
      .delete(schema.favicons)
      .where(inArray(schema.favicons.id, orphanedIds));

    return orphanedIds.length;
  }

  /**
   * Delete favicon mapping for a page URL.
   */
  async deleteFaviconForPage(pageUrl: string): Promise<void> {
    await this.db
      .delete(schema.iconMapping)
      .where(eq(schema.iconMapping.pageUrl, pageUrl));
  }

  // =================================================================
  //  INTERNAL HELPERS
  // =================================================================

  /**
   * Fetch favicon image from URL.
   */
  private async fetchFaviconImage(
    url: string,
  ): Promise<{ buffer: Buffer; width: number; height: number } | null> {
    try {
      const response = await net.fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; Stagewise/1.0; +https://stagewise.io)',
        },
      });

      if (!response.ok) return null;

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Try to detect image dimensions from common formats
      const dimensions = this.getImageDimensions(buffer);

      return {
        buffer,
        width: dimensions.width,
        height: dimensions.height,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract image dimensions from buffer (supports PNG, ICO, GIF, JPEG).
   */
  private getImageDimensions(buffer: Buffer): {
    width: number;
    height: number;
  } {
    // PNG: bytes 16-23 contain width and height as 4-byte big-endian integers
    if (
      buffer.length >= 24 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    }

    // JPEG: Look for SOF0 (0xFFC0), SOF1 (0xFFC1), or SOF2 (0xFFC2) markers
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length - 9) {
        // Find marker start
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        // SOF0, SOF1, SOF2 markers contain dimensions
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        // Skip non-SOF markers
        if (marker >= 0xc0 && marker <= 0xfe && marker !== 0xff) {
          // Markers with length field
          if (offset + 3 < buffer.length) {
            const segmentLength = buffer.readUInt16BE(offset + 2);
            offset += 2 + segmentLength;
          } else {
            break;
          }
        } else {
          offset++;
        }
      }
    }

    // ICO: byte 6-7 is width/height (0 means 256)
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x00 &&
      buffer[1] === 0x00 &&
      buffer[2] === 0x01 &&
      buffer[3] === 0x00
    ) {
      const width = buffer[6] || 256;
      const height = buffer[7] || 256;
      return { width, height };
    }

    // GIF: bytes 6-9 contain width and height as 2-byte little-endian
    if (
      buffer.length >= 10 &&
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46
    ) {
      return {
        width: buffer.readUInt16LE(6),
        height: buffer.readUInt16LE(8),
      };
    }

    // Default: assume 16x16 for unknown formats
    return { width: 16, height: 16 };
  }
}
