import { app, session, type DownloadItem } from 'electron';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Logger } from '../logger';
import type { HistoryService } from '../history';
import {
  DownloadState,
  type ActiveDownloadInfo,
} from '@shared/karton-contracts/pages-api/types';
import { DisposableService } from '../disposable';

/**
 * Simple throttle implementation for state change notifications.
 * Ensures the function is called at most once per `wait` milliseconds.
 */
function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  wait: number,
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastCallTime = 0;
  let pendingArgs: Parameters<T> | null = null;

  const throttled = ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - lastCallTime);

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCallTime = now;
      fn(...args);
    } else {
      pendingArgs = args;
      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          lastCallTime = Date.now();
          timeoutId = null;
          if (pendingArgs) {
            fn(...pendingArgs);
            pendingArgs = null;
          }
        }, remaining);
      }
    }
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    pendingArgs = null;
  };

  return throttled;
}

export interface DownloadSpeedDataPoint {
  timestamp: number;
  speedKBps: number;
  totalBytes: number;
}

export interface ActiveDownload {
  id: number;
  item: DownloadItem;
  state: DownloadState;
  receivedBytes: number;
  totalBytes: number;
  isPaused: boolean;
  canResume: boolean;
  // Metadata for state reporting
  url: string;
  targetPath: string;
  filename: string;
  startTime: Date;
  // Speed tracking
  speedHistory: DownloadSpeedDataPoint[];
  lastSpeedUpdateTime: number;
  lastSpeedUpdateBytes: number;
}

/** Callback type for active downloads state changes */
export type ActiveDownloadsChangeCallback = (
  downloads: Record<number, ActiveDownloadInfo>,
) => void;

/** Callback type for UI downloads state changes (used by KartonService) */
export type UIDownloadsChangeCallback = (
  activeDownloads: ActiveDownloadInfo[],
) => void;

/**
 * Service responsible for managing active downloads.
 * Tracks DownloadItem objects from Electron to enable pause/resume/cancel.
 */
export class DownloadsService extends DisposableService {
  private logger: Logger;
  private historyService: HistoryService;
  private activeDownloads: Map<number, ActiveDownload> = new Map();
  // Use session-based ID: combines session start timestamp (seconds) with counter
  // This ensures unique IDs across restarts while keeping numbers manageable
  private readonly sessionBase: number;
  private downloadIdCounter = 0;
  private onActiveDownloadsChange?: ActiveDownloadsChangeCallback;
  private onUIDownloadsChange?: UIDownloadsChangeCallback;
  // Track pending cleanup timeouts for proper cleanup
  private pendingCleanupTimeouts: Set<ReturnType<typeof setTimeout>> =
    new Set();
  // Throttled state change notification (100ms = max 10 updates/sec)
  private throttledNotifyStateChange: (() => void) & { cancel: () => void };

  private constructor(logger: Logger, historyService: HistoryService) {
    super();
    this.logger = logger;
    this.historyService = historyService;
    // Use seconds since 2024-01-01 as base to keep IDs smaller but unique
    this.sessionBase = Math.floor((Date.now() - 1704067200000) / 1000) * 1000;
    // Initialize throttled state change notification
    this.throttledNotifyStateChange = throttle(
      () => this.notifyStateChangeImmediate(),
      100,
    );
  }

  /**
   * Set a callback to be notified when active downloads change.
   * Used by PagesService to push state updates.
   */
  setOnActiveDownloadsChange(callback: ActiveDownloadsChangeCallback): void {
    this.onActiveDownloadsChange = callback;
  }

  /**
   * Set a callback to be notified when downloads change for UI state.
   * Used by main.ts to push state updates to KartonService (UI contract).
   */
  setOnUIDownloadsChange(callback: UIDownloadsChangeCallback): void {
    this.onUIDownloadsChange = callback;
  }

  /**
   * Build the state object for active downloads.
   */
  private buildActiveDownloadsState(): Record<number, ActiveDownloadInfo> {
    const state: Record<number, ActiveDownloadInfo> = {};
    for (const download of this.activeDownloads.values()) {
      const receivedBytes = download.item.getReceivedBytes();
      const totalBytes = download.item.getTotalBytes();
      // Get the most recent speed from history, or 0 if no data yet
      const currentSpeedKBps =
        download.speedHistory.length > 0
          ? download.speedHistory[download.speedHistory.length - 1].speedKBps
          : 0;
      state[download.id] = {
        id: download.id,
        state: download.state,
        receivedBytes,
        totalBytes,
        isPaused: download.item.isPaused(),
        canResume: download.item.canResume(),
        progress:
          totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0,
        filename: download.filename,
        url: download.url,
        targetPath: download.targetPath,
        startTime: download.startTime,
        currentSpeedKBps,
        speedHistory: download.speedHistory,
      };
    }
    return state;
  }

  /**
   * Notify listeners of active downloads state change (immediate, no throttling).
   * Use this for important state changes like download complete/cancelled.
   */
  private notifyStateChangeImmediate(): void {
    const stateRecord = this.buildActiveDownloadsState();
    if (this.onActiveDownloadsChange) {
      this.onActiveDownloadsChange(stateRecord);
    }
    if (this.onUIDownloadsChange) {
      this.onUIDownloadsChange(Object.values(stateRecord));
    }
  }

  /**
   * Notify listeners of active downloads state change.
   * @param immediate - If true, bypasses throttling for important state changes
   */
  private notifyStateChange(immediate = false): void {
    if (immediate) {
      // Cancel any pending throttled call and notify immediately
      this.throttledNotifyStateChange.cancel();
      this.notifyStateChangeImmediate();
    } else {
      this.throttledNotifyStateChange();
    }
  }

  public static create(
    logger: Logger,
    historyService: HistoryService,
  ): DownloadsService {
    const instance = new DownloadsService(logger, historyService);
    instance.initialize();
    logger.debug('[DownloadsService] Created service');
    return instance;
  }

  private initialize(): void {
    // Get the browser content session
    const ses = session.fromPartition('persist:browser-content');

    // Listen for new downloads
    ses.on('will-download', (_event, item, _webContents) => {
      this.handleNewDownload(item);
    });

    this.logger.debug(
      '[DownloadsService] Initialized and listening for downloads',
    );
  }

  private handleNewDownload(item: DownloadItem): void {
    const downloadId = this.sessionBase + this.downloadIdCounter++;
    let hasRecordedToDb = false;
    const startTime = new Date();

    this.logger.info('[DownloadsService] New download initiated', {
      id: downloadId,
      url: item.getURL(),
      filename: item.getFilename(),
      totalBytes: item.getTotalBytes(),
    });

    // Create active download entry with initial metadata
    const activeDownload: ActiveDownload = {
      id: downloadId,
      item,
      state: DownloadState.IN_PROGRESS,
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      isPaused: false,
      canResume: item.canResume(),
      url: item.getURL(),
      targetPath: item.getSavePath() || '',
      filename: item.getFilename() || 'Unknown',
      startTime,
      speedHistory: [],
      lastSpeedUpdateTime: Date.now(),
      lastSpeedUpdateBytes: 0,
    };

    this.activeDownloads.set(downloadId, activeDownload);

    // Notify state change for new download (immediate - important event)
    this.notifyStateChange(true);

    // Helper to record download to database once we have the save path
    const recordToDatabase = () => {
      if (hasRecordedToDb) return;

      const savePath = item.getSavePath();
      if (!savePath) return; // Still no path, wait for next event

      hasRecordedToDb = true;

      // Update metadata now that we have the save path
      activeDownload.targetPath = savePath;
      activeDownload.filename = path.basename(savePath);

      this.logger.info('[DownloadsService] Recording download with save path', {
        id: downloadId,
        savePath,
      });

      // Notify state change with updated metadata (immediate - important event)
      this.notifyStateChange(true);

      this.historyService
        .startDownload({
          guid: `${downloadId}`,
          url: item.getURL(),
          targetPath: savePath,
          totalBytes: item.getTotalBytes(),
          mimeType: item.getMimeType(),
        })
        .catch((err) => {
          this.logger.error(
            '[DownloadsService] Failed to record download',
            err,
          );
        });
    };

    // Try to record immediately if path is already set
    recordToDatabase();

    // Track progress updates
    item.on('updated', (_event, state) => {
      const download = this.activeDownloads.get(downloadId);
      if (!download) return;

      // Try to record to DB on first progress update (user has selected save location)
      recordToDatabase();

      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      download.isPaused = item.isPaused();
      download.canResume = item.canResume();

      // Calculate and record speed (only when actively downloading, not paused)
      if (state === 'progressing' && !download.isPaused) {
        const now = Date.now();
        const timeDelta = now - download.lastSpeedUpdateTime;

        // Record a data point every 1 second for high resolution recent data
        if (timeDelta >= 1000) {
          const bytesDelta =
            download.receivedBytes - download.lastSpeedUpdateBytes;
          const speedKBps = ((bytesDelta / timeDelta) * 1000) / 1024;

          const newPoint = {
            timestamp: now,
            speedKBps: Math.max(0, speedKBps),
            totalBytes: download.receivedBytes,
          };

          // Consolidate older data points (older than 10 seconds) to 6-second intervals
          const recentThreshold = now - 10000; // 10 seconds ago
          const consolidationInterval = 6000; // 6 seconds for older data

          let consolidatedHistory = [...download.speedHistory];

          // Find points older than 10 seconds that need consolidation
          const recentPoints = consolidatedHistory.filter(
            (p) => p.timestamp >= recentThreshold,
          );
          const olderPoints = consolidatedHistory.filter(
            (p) => p.timestamp < recentThreshold,
          );

          // Consolidate older points by averaging within 6-second buckets
          if (olderPoints.length > 0) {
            const consolidated: typeof olderPoints = [];
            let bucketStart = olderPoints[0].timestamp;
            let bucketPoints: typeof olderPoints = [];

            for (const point of olderPoints) {
              if (point.timestamp - bucketStart < consolidationInterval) {
                bucketPoints.push(point);
              } else {
                // Emit average for this bucket
                if (bucketPoints.length > 0) {
                  const avgSpeed =
                    bucketPoints.reduce((sum, p) => sum + p.speedKBps, 0) /
                    bucketPoints.length;
                  consolidated.push({
                    timestamp: bucketPoints[0].timestamp,
                    speedKBps: avgSpeed,
                    totalBytes:
                      bucketPoints[bucketPoints.length - 1].totalBytes,
                  });
                }
                bucketStart = point.timestamp;
                bucketPoints = [point];
              }
            }
            // Don't forget the last bucket
            if (bucketPoints.length > 0) {
              const avgSpeed =
                bucketPoints.reduce((sum, p) => sum + p.speedKBps, 0) /
                bucketPoints.length;
              consolidated.push({
                timestamp: bucketPoints[0].timestamp,
                speedKBps: avgSpeed,
                totalBytes: bucketPoints[bucketPoints.length - 1].totalBytes,
              });
            }

            consolidatedHistory = [...consolidated, ...recentPoints];
          }

          // Create new array to avoid frozen array issues from state management
          download.speedHistory = [...consolidatedHistory, newPoint];

          download.lastSpeedUpdateTime = now;
          download.lastSpeedUpdateBytes = download.receivedBytes;
        }
      }

      if (state === 'interrupted') {
        download.state = DownloadState.INTERRUPTED;
        this.logger.debug('[DownloadsService] Download interrupted', {
          id: downloadId,
        });
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          // Add a zero speed point when paused to show drop in graph (only once)
          const lastPoint =
            download.speedHistory.length > 0
              ? download.speedHistory[download.speedHistory.length - 1]
              : null;
          const alreadyHasZeroPoint = lastPoint && lastPoint.speedKBps === 0;

          if (!alreadyHasZeroPoint) {
            const now = Date.now();
            download.speedHistory = [
              ...download.speedHistory,
              {
                timestamp: now,
                speedKBps: 0,
                totalBytes: download.receivedBytes,
              },
            ];
            download.lastSpeedUpdateTime = now;
            download.lastSpeedUpdateBytes = download.receivedBytes;

            this.logger.debug('[DownloadsService] Download paused', {
              id: downloadId,
            });
          }
        }
      }

      // Notify state change on every progress update
      this.notifyStateChange();
    });

    // Handle download completion
    item.once('done', (_event, state) => {
      const download = this.activeDownloads.get(downloadId);
      if (!download) return;

      // Ensure we record to DB even if no progress events fired
      recordToDatabase();

      let downloadState: DownloadState;
      const savePath = item.getSavePath();
      if (state === 'completed') {
        downloadState = DownloadState.COMPLETE;
        this.logger.info('[DownloadsService] Download completed', {
          id: downloadId,
          path: savePath,
        });

        // Notify macOS dock that download finished (shows bouncing icon in Downloads stack)
        if (savePath) {
          app.dock?.downloadFinished(savePath);
        }
      } else if (state === 'cancelled') {
        downloadState = DownloadState.CANCELLED;
        this.logger.info('[DownloadsService] Download cancelled', {
          id: downloadId,
        });
      } else {
        // interrupted
        downloadState = DownloadState.INTERRUPTED;
        this.logger.warn('[DownloadsService] Download failed', {
          id: downloadId,
        });
      }

      download.state = downloadState;

      // Update the database with final state and progress
      this.historyService
        .updateDownload(`${downloadId}`, {
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes(),
          state: downloadState,
          endTime: new Date(),
        })
        .catch((err) => {
          this.logger.error(
            '[DownloadsService] Failed to update download state',
            err,
          );
        });

      // Remove from active downloads after a delay (allow status to be queried)
      const timeoutId = setTimeout(() => {
        this.pendingCleanupTimeouts.delete(timeoutId);
        this.activeDownloads.delete(downloadId);
        // Notify state change after removal (immediate - important event)
        this.notifyStateChange(true);
      }, 5000);
      this.pendingCleanupTimeouts.add(timeoutId);
    });
  }

  /**
   * Get all active downloads with fresh values from DownloadItem.
   */
  getActiveDownloads(): (ActiveDownload & { currentSpeedKBps: number })[] {
    return Array.from(this.activeDownloads.values()).map((download) => ({
      ...download,
      // Read fresh values directly from the DownloadItem
      receivedBytes: download.item.getReceivedBytes(),
      totalBytes: download.item.getTotalBytes(),
      isPaused: download.item.isPaused(),
      canResume: download.item.canResume(),
      // Compute current speed from history
      currentSpeedKBps:
        download.speedHistory.length > 0
          ? download.speedHistory[download.speedHistory.length - 1].speedKBps
          : 0,
    }));
  }

  /**
   * Get a specific active download by ID with fresh values.
   */
  getActiveDownload(downloadId: number): ActiveDownload | undefined {
    const download = this.activeDownloads.get(downloadId);
    if (!download) return undefined;
    return {
      ...download,
      receivedBytes: download.item.getReceivedBytes(),
      totalBytes: download.item.getTotalBytes(),
      isPaused: download.item.isPaused(),
      canResume: download.item.canResume(),
    };
  }

  /**
   * Pause a download.
   * @returns true if paused, false if download not found or cannot be paused
   */
  pauseDownload(downloadId: number): boolean {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      this.logger.warn('[DownloadsService] Cannot pause: download not found', {
        id: downloadId,
      });
      return false;
    }

    if (download.isPaused) {
      this.logger.debug('[DownloadsService] Download already paused', {
        id: downloadId,
      });
      return true;
    }

    download.item.pause();
    download.isPaused = true;
    this.logger.info('[DownloadsService] Download paused', { id: downloadId });
    this.notifyStateChange(true);
    return true;
  }

  /**
   * Resume a paused download.
   * @returns true if resumed, false if download not found or cannot be resumed
   */
  resumeDownload(downloadId: number): boolean {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      this.logger.warn('[DownloadsService] Cannot resume: download not found', {
        id: downloadId,
      });
      return false;
    }

    if (!download.canResume) {
      this.logger.warn('[DownloadsService] Download cannot be resumed', {
        id: downloadId,
      });
      return false;
    }

    if (!download.isPaused) {
      this.logger.debug('[DownloadsService] Download not paused', {
        id: downloadId,
      });
      return true;
    }

    download.item.resume();
    download.isPaused = false;

    // Reset speed tracking to avoid misleading calculation after pause
    download.lastSpeedUpdateTime = Date.now();
    download.lastSpeedUpdateBytes = download.item.getReceivedBytes();

    this.logger.info('[DownloadsService] Download resumed', { id: downloadId });
    this.notifyStateChange(true);
    return true;
  }

  /**
   * Cancel a download and delete the partial file.
   * @returns true if cancelled, false if download not found
   */
  async cancelDownload(downloadId: number): Promise<boolean> {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      this.logger.warn('[DownloadsService] Cannot cancel: download not found', {
        id: downloadId,
      });
      return false;
    }

    // Get the save path and current progress before cancelling
    const savePath = download.item.getSavePath();
    const receivedBytes = download.item.getReceivedBytes();
    const totalBytes = download.item.getTotalBytes();

    download.item.cancel();
    download.state = DownloadState.CANCELLED;

    // Update the database with cancelled state - await to ensure it's done before notifying
    try {
      await this.historyService.updateDownload(`${downloadId}`, {
        receivedBytes,
        totalBytes,
        state: DownloadState.CANCELLED,
        endTime: new Date(),
      });
    } catch (err) {
      this.logger.error(
        '[DownloadsService] Failed to update cancelled download',
        err,
      );
    }

    // Remove from active downloads after DB update
    this.activeDownloads.delete(downloadId);

    // Notify state change after removal (immediate - important event)
    this.notifyStateChange(true);

    // Delete the partial file if it exists
    if (savePath && existsSync(savePath)) {
      try {
        unlinkSync(savePath);
        this.logger.info('[DownloadsService] Deleted partial download file', {
          id: downloadId,
          path: savePath,
        });
      } catch (err) {
        this.logger.warn('[DownloadsService] Failed to delete partial file', {
          id: downloadId,
          path: savePath,
          error: err,
        });
      }
    }

    this.logger.info('[DownloadsService] Download cancelled', {
      id: downloadId,
    });
    return true;
  }

  /**
   * Cleanup resources.
   */
  protected onTeardown(): void {
    // Cancel throttled notifications
    this.throttledNotifyStateChange.cancel();

    // Clear all pending cleanup timeouts
    for (const timeoutId of this.pendingCleanupTimeouts) {
      clearTimeout(timeoutId);
    }
    this.pendingCleanupTimeouts.clear();

    // Cancel all active downloads
    for (const download of this.activeDownloads.values()) {
      try {
        download.item.cancel();
      } catch (err) {
        this.logger.debug(
          '[DownloadsService] Error cancelling download during teardown',
          {
            id: download.id,
            error: err,
          },
        );
      }
    }
    this.activeDownloads.clear();
    this.logger.debug('[DownloadsService] Teardown complete');
  }
}
