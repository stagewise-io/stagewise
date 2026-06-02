/**
 * Persistence facade for agent-core.
 *
 * Hosts construct one `AgentCorePersistence` at boot, passing in the
 * already-assembled `AgentHost` (paths + logger) and the `AgentStore`.
 * The facade owns:
 *   - construction order of every persistence service in core
 *   - schema migration ordering (each service still owns its own
 *     migration, but the facade decides the await order)
 *   - the "all persistence ready" signal — once `await create()`
 *     resolves, every DB has finished migrating
 *   - teardown sequencing on shutdown
 *
 * Hosts no longer enumerate `DiffHistoryService.create`,
 * `FileReadCacheService.create`, `ProcessedImageCacheService.create`,
 * `AgentPersistenceDB.create`, and `new AttachmentsService(...)`
 * individually. They receive a typed bag with each service as a
 * `readonly` field.
 */

import type { AgentHost } from '../../host';
import type { AgentStore } from '../../store';
import { DisposableService } from '../shared/disposable';
import { AttachmentsService } from '../attachments';
import { DiffHistoryService } from '../diff-history';
import { FileReadCacheService } from '../file-read-cache';
import { ProcessedImageCacheService } from '../processed-image-cache';
import { AgentPersistenceDB } from '../agent-persistence';

export interface AgentCorePersistenceOptions {
  host: AgentHost;
  store: AgentStore;
  /**
   * Optional pre-constructed `AttachmentsService`. Useful when host
   * services that boot before the persistence facade (e.g. the
   * browser's `WindowLayoutService` registering the `attachment://`
   * protocol handler) need to share a single instance with the
   * facade. If omitted, the facade constructs its own.
   */
  attachments?: AttachmentsService;
}

interface AgentCorePersistenceParts {
  diffHistory: DiffHistoryService;
  fileReadCache: FileReadCacheService;
  processedImageCache: ProcessedImageCacheService | undefined;
  attachments: AttachmentsService;
  agentDb: AgentPersistenceDB;
}

export class AgentCorePersistence extends DisposableService {
  public readonly diffHistory: DiffHistoryService;
  public readonly fileReadCache: FileReadCacheService;
  /**
   * Optional — initialisation is wrapped in try/catch so image-cache
   * failures (e.g. corrupted DB, disk full) degrade gracefully without
   * blocking agent boot. Consumers must treat it as optional.
   */
  public readonly processedImageCache: ProcessedImageCacheService | undefined;
  public readonly attachments: AttachmentsService;
  public readonly agentDb: AgentPersistenceDB;

  private constructor(parts: AgentCorePersistenceParts) {
    super();
    this.diffHistory = parts.diffHistory;
    this.fileReadCache = parts.fileReadCache;
    this.processedImageCache = parts.processedImageCache;
    this.attachments = parts.attachments;
    this.agentDb = parts.agentDb;
  }

  /**
   * Build every persistence service in core. Resolves only after every
   * required DB has finished migrating. Throws if `AgentPersistenceDB`
   * fails to initialise — without agent persistence, nothing meaningful
   * can happen.
   */
  public static async create(
    opts: AgentCorePersistenceOptions,
  ): Promise<AgentCorePersistence> {
    const { host, store } = opts;
    const { paths, logger } = host;

    const diffHistory = await DiffHistoryService.create({ host, store });
    const fileReadCache = await FileReadCacheService.create({
      host: paths,
      logger,
    });
    let processedImageCache: ProcessedImageCacheService | undefined;
    try {
      processedImageCache = await ProcessedImageCacheService.create({
        host: paths,
        logger,
      });
    } catch (err) {
      logger.warn(
        `[AgentCorePersistence] ProcessedImageCacheService failed to initialise — image caching disabled: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const attachments = opts.attachments ?? new AttachmentsService(paths);
    const agentDb = await AgentPersistenceDB.create({ host: paths, logger });
    if (!agentDb) {
      throw new Error(
        '[AgentCorePersistence] AgentPersistenceDB.create returned null — schema migration failed',
      );
    }

    return new AgentCorePersistence({
      diffHistory,
      fileReadCache,
      processedImageCache,
      attachments,
      agentDb,
    });
  }

  /**
   * Late-bound resolver for `DiffHistoryService`'s gitignore check.
   * Called by the host once `ToolboxService` / `MountManagerService`
   * has finished its async init.
   */
  public setMountPathsResolver(resolver: () => Set<string>): void {
    this.diffHistory.setMountPathsResolver(resolver);
  }

  protected async onTeardown(): Promise<void> {
    await this.diffHistory.teardown();
    this.fileReadCache.teardown();
    this.processedImageCache?.teardown();
  }
}
