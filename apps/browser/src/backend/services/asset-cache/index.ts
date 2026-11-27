import fs from 'node:fs/promises';
import { DisposableService } from '../disposable';
import type { Logger } from '../logger';

export type ResolveResult = { type: 'buffer'; buffer: Buffer };

/** Resolves local attachments without uploading them to a managed service. */
export class AssetCacheService extends DisposableService {
  public static async create(_logger: Logger): Promise<AssetCacheService> {
    return new AssetCacheService();
  }

  public async resolve(
    filePath: string,
    _mediaType: string,
    _filename: string,
  ): Promise<ResolveResult> {
    this.assertNotDisposed();
    return { type: 'buffer', buffer: await fs.readFile(filePath) };
  }

  protected onTeardown(): void {}
}
