import { DisposableService } from './disposable';
import type { Logger } from './logger';
import type { LocalPortEntry } from '@shared/karton-contracts/pages-api/types';
import { getAllListeningPorts, checkPortHasContent } from '../utils/port-utils';

/**
 * Service that discovers local HTTP servers running on localhost
 * and syncs the results to the home page state.
 * Scans are triggered on demand (e.g. page focus, refresh button).
 */
export class LocalPortsScannerService extends DisposableService {
  private readonly logger: Logger;
  private readonly excludePorts: Set<number>;
  private cachedEntries: LocalPortEntry[] = [];
  private lastScanTime = 0;

  private constructor(logger: Logger, excludePorts: number[]) {
    super();
    this.logger = logger;
    this.excludePorts = new Set(excludePorts);
  }

  public static async create(
    logger: Logger,
    excludePorts: number[] = [],
  ): Promise<LocalPortsScannerService> {
    const instance = new LocalPortsScannerService(logger, excludePorts);
    logger.debug('[LocalPortsScanner] Created service');
    return instance;
  }

  /**
   * Run a scan and sync results to state.
   */
  public async scan(): Promise<void> {
    if (this.disposed) return;

    try {
      const allPorts = await getAllListeningPorts();

      // Filter out excluded ports
      const candidatePorts = allPorts.filter((p) => !this.excludePorts.has(p));

      // Check which ports have HTTP content
      const checks = await Promise.all(
        candidatePorts.map(async (port) => ({
          port,
          hasContent: await checkPortHasContent(port),
        })),
      );

      const entries: LocalPortEntry[] = checks
        .filter((c) => c.hasContent)
        .map((c) => ({
          port: c.port,
          url: `http://localhost:${c.port}`,
        }));

      this.cachedEntries = entries;
      this.lastScanTime = Date.now();

      this.logger.debug(
        `[LocalPortsScanner] Updated local ports: ${entries.length} found`,
      );
    } catch (error) {
      this.logger.warn('[LocalPortsScanner] Scan failed', error);
    }
  }

  public getCachedEntries(): LocalPortEntry[] {
    return this.cachedEntries;
  }

  public getLastScanTime(): number {
    return this.lastScanTime;
  }

  protected onTeardown(): void {
    this.logger.debug('[LocalPortsScanner] Teardown complete');
  }
}
