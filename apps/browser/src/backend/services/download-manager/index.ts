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
}

/** Callback type for active downloads state changes */
export type ActiveDownloadsChangeCallback = (
  downloads: Record<number, ActiveDownloadInfo>,
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
  // Track pending cleanup timeouts for proper cleanup
  private pendingCleanupTimeouts: Set<ReturnType<typeof setTimeout>> =
    new Set();

  private constructor(logger: Logger, historyService: HistoryService) {
    super();
    this.logger = logger;
    this.historyService = historyService;
    // Use seconds since 2024-01-01 as base to keep IDs smaller but unique
    this.sessionBase = Math.floor((Date.now() - 1704067200000) / 1000) * 1000;
  }

  /**
   * Set a callback to be notified when active downloads change.
   * Used by PagesService to push state updates.
   */
  setOnActiveDownloadsChange(callback: ActiveDownloadsChangeCallback): void {
    this.onActiveDownloadsChange = callback;
  }

  /**
   * Build the state object for active downloads.
   */
  private buildActiveDownloadsState(): Record<number, ActiveDownloadInfo> {
    const state: Record<number, ActiveDownloadInfo> = {};
    for (const download of this.activeDownloads.values()) {
      const receivedBytes = download.item.getReceivedBytes();
      const totalBytes = download.item.getTotalBytes();
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
      };
    }
    return state;
  }

  /**
   * Notify listeners of active downloads state change.
   */
  private notifyStateChange(): void {
    if (this.onActiveDownloadsChange) {
      this.onActiveDownloadsChange(this.buildActiveDownloadsState());
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
    };

    this.activeDownloads.set(downloadId, activeDownload);

    // Notify state change for new download
    this.notifyStateChange();

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

      // Notify state change with updated metadata
      this.notifyStateChange();

      this.historyService
        .startDownload({
          guid: `${downloadId}`,
          url: item.getURL(),
          targetPath: savePath,
          totalBytes: item.getTotalBytes(),
          mimeType: item.getMimeType(),
        })
        .catch((err) => {
          this.logger.error('[DownloadsService] Failed to record download', err);
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

      if (state === 'interrupted') {
        download.state = DownloadState.INTERRUPTED;
        this.logger.debug('[DownloadsService] Download interrupted', {
          id: downloadId,
        });
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          this.logger.debug('[DownloadsService] Download paused', {
            id: downloadId,
          });
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
        // Notify state change after removal
        this.notifyStateChange();
      }, 5000);
      this.pendingCleanupTimeouts.add(timeoutId);
    });
  }

  /**
   * Get all active downloads with fresh values from DownloadItem.
   */
  getActiveDownloads(): ActiveDownload[] {
    return Array.from(this.activeDownloads.values()).map((download) => ({
      ...download,
      // Read fresh values directly from the DownloadItem
      receivedBytes: download.item.getReceivedBytes(),
      totalBytes: download.item.getTotalBytes(),
      isPaused: download.item.isPaused(),
      canResume: download.item.canResume(),
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
    this.notifyStateChange();
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
    this.logger.info('[DownloadsService] Download resumed', { id: downloadId });
    this.notifyStateChange();
    return true;
  }

  /**
   * Cancel a download and delete the partial file.
   * @returns true if cancelled, false if download not found
   */
  cancelDownload(downloadId: number): boolean {
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

    // Update the database immediately with cancelled state
    this.historyService
      .updateDownload(`${downloadId}`, {
        receivedBytes,
        totalBytes,
        state: DownloadState.CANCELLED,
        endTime: new Date(),
      })
      .catch((err) => {
        this.logger.error(
          '[DownloadsService] Failed to update cancelled download',
          err,
        );
      });

    // Remove from active downloads immediately so UI shows DB values
    this.activeDownloads.delete(downloadId);

    // Notify state change after removal
    this.notifyStateChange();

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
