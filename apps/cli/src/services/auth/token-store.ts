import type { Logger } from '../logger';
import type { GlobalDataPathService } from '../global-data-path';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import superjson from 'superjson';

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
      .readFile(this.getTokenDataPath(), 'utf-8')
      .then((data) => {
        const jsonData = superjson.parse(data);
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
        this.logger.error(
          `[AuthTokenStore] Failed to read token data. Error: ${err}, File path: ${this.getTokenDataPath()}`,
        );
        return null;
      });
    return tokenData;
  }

  private async storeTokenData(): Promise<void> {
    await fs
      .writeFile(
        this.getTokenDataPath(),
        superjson.stringify(this._tokenData),
        'utf-8',
      )
      .catch((err) => {
        this.logger.error(
          `[AuthTokenStore] Failed to store token data. Error: ${err}, File path: ${this.getTokenDataPath()}`,
        );
      });
  }
}
