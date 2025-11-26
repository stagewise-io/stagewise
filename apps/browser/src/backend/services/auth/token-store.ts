import type { Logger } from '../logger';
import type { GlobalDataPathService } from '../global-data-path';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import superjson from 'superjson';
import { safeStorage } from 'electron';

export const tokenDataSchema = z.looseObject({
  accessToken: z.string(),
  expiresAt: z.date().nullish(),
  refreshToken: z.string(),
  refreshExpiresAt: z.date().nullish(),
});

export type TokenData = z.infer<typeof tokenDataSchema>;

const tokenFileName = 'credentials.json';

export class AuthTokenStore {
  private globalDataPathService: GlobalDataPathService;
  private logger: Logger;

  private _tokenData: TokenData | null = null;

  private constructor(
    globalDataPathService: GlobalDataPathService,
    logger: Logger,
  ) {
    this.globalDataPathService = globalDataPathService;
    this.logger = logger;
  }

  private async initialize(): Promise<void> {
    const tokenData = await this.getStoredTokenData();
    if (tokenData) {
      this._tokenData = tokenData;
    }
  }

  public static async create(
    globalDataPathService: GlobalDataPathService,
    logger: Logger,
  ): Promise<AuthTokenStore> {
    const tokenStore = new AuthTokenStore(globalDataPathService, logger);
    await tokenStore.initialize();
    return tokenStore;
  }

  get tokenData(): TokenData | null {
    return this._tokenData;
  }

  set tokenData(tokenData: TokenData | null) {
    this._tokenData = tokenData;
    void this.storeTokenData();
  }

  private getTokenDataPath(): string {
    return path.join(this.globalDataPathService.globalDataPath, tokenFileName);
  }

  private async getStoredTokenData(): Promise<TokenData | null> {
    const tokenData = await fs
      .readFile(this.getTokenDataPath())
      .then((buffer) => {
        let dataStr: string;
        try {
          if (safeStorage.isEncryptionAvailable()) {
            dataStr = safeStorage.decryptString(buffer);
          } else {
            throw new Error('Encryption not available');
          }
        } catch {
          // If decryption fails, assume the file is unencrypted
          dataStr = buffer.toString('utf-8');
        }

        const jsonData = superjson.parse(dataStr);
        const parsedTokenData = tokenDataSchema.safeParse(jsonData);
        if (!parsedTokenData.success) {
          this.logger.error(
            `[AuthTokenStore] Invalid token data. Error: ${parsedTokenData.error}, File path: ${this.getTokenDataPath()}`,
          );
          return null;
        }
        return parsedTokenData.data;
      })
      .catch((err) => {
        this.logger.debug(
          `[AuthTokenStore] Failed to read token data. Error: ${err}, File path: ${this.getTokenDataPath()}`,
        );
        return null;
      });
    return tokenData;
  }

  private async storeTokenData(): Promise<void> {
    // If the path to the file doesn't exist, it will be created.
    await fs
      .mkdir(path.dirname(this.getTokenDataPath()), { recursive: true })
      .catch((err) => {
        this.logger.error(
          `[AuthTokenStore] Failed to create directory for token data. Error: ${err}, File path: ${this.getTokenDataPath()}`,
        );
      });

    // if the tokenData is null, we should remove the file (if it exists)
    if (
      this._tokenData === null &&
      fsSync.existsSync(this.getTokenDataPath())
    ) {
      await fs.rm(this.getTokenDataPath()).catch((err) => {
        this.logger.error(
          `[AuthTokenStore] Failed to remove token data file. Error: ${err}, File path: ${this.getTokenDataPath()}`,
        );
      });
    } else if (this._tokenData !== null) {
      const stringifiedData = superjson.stringify(this._tokenData);
      let dataToWrite: Buffer | string = stringifiedData;

      if (safeStorage.isEncryptionAvailable()) {
        try {
          dataToWrite = safeStorage.encryptString(stringifiedData);
        } catch (error) {
          this.logger.warn(
            `[AuthTokenStore] Failed to encrypt token data, falling back to plaintext. Error: ${error}`,
          );
        }
      }

      await fs
        .writeFile(this.getTokenDataPath(), dataToWrite, {
          flush: true,
          encoding: Buffer.isBuffer(dataToWrite) ? undefined : 'utf-8',
        })
        .catch((err) => {
          this.logger.error(
            `[AuthTokenStore] Failed to store token data. Error: ${err}, File path: ${this.getTokenDataPath()}`,
          );
        });
    }
  }
}
