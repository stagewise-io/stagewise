import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { DisposableService } from '../disposable';
import type { Logger } from '../logger';
import {
  readPersistedData,
  writePersistedData,
} from '../../utils/persisted-data';
import {
  credentialTypeRegistry,
  extractSecretFieldNames,
  type CredentialTypeId,
  type CredentialInputData,
  type ResolvedCredential,
  type SecretEntry,
} from '@shared/credential-types';

const STORAGE_NAME = 'credentials' as const;

/**
 * Zod schema for the on-disk credentials store.
 * Keyed by credential type ID, each value is a flat string-to-string record
 * matching the fields declared in the credential type's schema.
 */
const credentialsStoreSchema = z.record(
  z.string(),
  z.record(z.string(), z.string()),
);

type CredentialsStore = z.infer<typeof credentialsStoreSchema>;

/**
 * Generates a 6-character hex nonce for placeholder uniqueness.
 */
function generateNonce(): string {
  return randomBytes(3).toString('hex');
}

/**
 * Manages encrypted credential storage and placeholder-based resolution.
 *
 * Credentials are stored in a single encrypted JSON file (`credentials.json`)
 * using Electron's safeStorage (OS keychain integration). Each credential
 * conforms to a registered `CredentialTypeDefinition` that declares its schema,
 * which fields are secrets, and an optional refresh/validation hook.
 *
 * The `resolve()` method returns an agent-safe object where secret fields are
 * replaced with opaque placeholders, plus a `secretMap` for the sandbox worker's
 * fetch proxy to perform real substitution at network time.
 */
export class CredentialsService extends DisposableService {
  private readonly logger: Logger;

  private store: CredentialsStore = {};
  private saveQueue: Promise<void> = Promise.resolve();

  private constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  public static async create(logger: Logger): Promise<CredentialsService> {
    const instance = new CredentialsService(logger);
    await instance.initialize();
    return instance;
  }

  private async initialize(): Promise<void> {
    this.logger.debug('[CredentialsService] Initializing...');
    this.store = await readPersistedData(
      STORAGE_NAME,
      credentialsStoreSchema,
      {},
      { encrypt: true },
    );
    this.logger.debug(
      `[CredentialsService] Loaded ${Object.keys(this.store).length} credential(s)`,
    );
  }

  private async save(): Promise<void> {
    this.saveQueue = this.saveQueue.then(() =>
      writePersistedData(STORAGE_NAME, credentialsStoreSchema, this.store, {
        encrypt: true,
      }),
    );
    return this.saveQueue;
  }

  /**
   * Store credential data for a registered type.
   * Validates that the type exists and the data matches its schema.
   *
   * The `data` parameter is fully typed per credential type, e.g.
   * `set('figma-pat', { token: '...' })` expects exactly `{ token: string }`.
   */
  public async set<T extends CredentialTypeId>(
    typeId: T,
    data: CredentialInputData<T>,
  ): Promise<void> {
    this.assertNotDisposed();
    const typeDef = credentialTypeRegistry[typeId];
    if (!typeDef) throw new Error(`Unknown credential type: ${typeId}`);

    typeDef.schema.parse(data);

    this.store[typeId] = data as Record<string, string>;
    await this.save();

    this.logger.debug(`[CredentialsService] Stored credential: ${typeId}`);
  }

  /**
   * Remove stored credential data for a type.
   */
  public async delete(typeId: CredentialTypeId): Promise<void> {
    this.assertNotDisposed();
    if (!(typeId in this.store)) return;

    delete this.store[typeId];
    await this.save();

    this.logger.debug(`[CredentialsService] Deleted credential: ${typeId}`);
  }

  /**
   * Check whether credential data is stored for a type.
   */
  public has(typeId: CredentialTypeId): boolean {
    this.assertNotDisposed();
    return typeId in this.store;
  }

  /**
   * Return the list of credential type IDs that have stored data.
   */
  public listConfigured(): CredentialTypeId[] {
    this.assertNotDisposed();
    return Object.keys(this.store).filter(
      (k) => k in credentialTypeRegistry,
    ) as CredentialTypeId[];
  }

  /**
   * Resolve a stored credential for use in the sandbox.
   *
   * 1. Loads the stored data (returns `null` if none exists).
   * 2. Runs the credential type's `onGet` hook with real (decrypted) values.
   *    This allows validation or token refresh in the main process.
   * 3. If `onGet` updated the data, re-persists the changes.
   * 4. Builds the agent-safe result: plain fields pass through,
   *    secret fields become `{{CRED:<typeId>:<field>:<nonce>}}` placeholders.
   * 5. Returns `{ data, secretMap }` for the sandbox worker.
   */
  public async resolve(
    typeId: CredentialTypeId,
  ): Promise<ResolvedCredential | null> {
    this.assertNotDisposed();

    const typeDef = credentialTypeRegistry[typeId];
    if (!typeDef) return null;

    const raw = this.store[typeId];
    if (!raw) return null;

    let current: Record<string, string>;
    try {
      // .brand() is type-level only in Zod v4; .parse() returns plain strings at runtime
      current = typeDef.schema.parse(raw) as unknown as Record<string, string>;
    } catch {
      this.logger.error(
        `[CredentialsService] Stored data for ${typeId} failed schema validation`,
      );
      return null;
    }

    const refreshed = (await (
      typeDef.onGet as (arg: unknown) => Promise<unknown>
    )(current)) as Record<string, string> | null;
    if (refreshed === null) {
      this.logger.warn(
        `[CredentialsService] onGet returned null for ${typeId} (invalid/expired)`,
      );
      return null;
    }

    if (JSON.stringify(refreshed) !== JSON.stringify(current)) {
      this.store[typeId] = refreshed;
      await this.save();
      this.logger.debug(
        `[CredentialsService] onGet updated data for ${typeId}, persisted`,
      );
    }

    const secretFields = new Set(
      extractSecretFieldNames(typeDef.schema as z.ZodObject<z.ZodRawShape>),
    );
    const data: Record<string, string> = {};
    const secretMap = new Map<string, SecretEntry>();

    for (const [field, value] of Object.entries(refreshed)) {
      if (secretFields.has(field)) {
        const nonce = generateNonce();
        const placeholder = `{{CRED:${typeId}:${field}:${nonce}}}`;
        data[field] = placeholder;
        secretMap.set(placeholder, {
          value,
          allowedOrigins: typeDef.allowedOrigins,
        });
      } else {
        data[field] = value;
      }
    }

    return { data, secretMap };
  }

  protected onTeardown(): void {
    this.logger.debug('[CredentialsService] Teardown complete');
  }
}
