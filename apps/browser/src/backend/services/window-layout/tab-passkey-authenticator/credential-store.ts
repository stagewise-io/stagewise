import { z } from 'zod';
import type { Logger } from '../../logger';
import {
  readPersistedDataSync,
  writePersistedDataSync,
} from '../../../utils/persisted-data';

/**
 * A credential held by the virtual authenticator, in the shape CDP's
 * `WebAuthn.Credential` type uses. All binary fields are base64.
 */
export const storedPasskeyCredentialSchema = z.object({
  credentialId: z.string(),
  rpId: z.string(),
  isResidentCredential: z.boolean(),
  /** Base64 PKCS#8 private key. Persisted encrypted via safeStorage. */
  privateKey: z.string(),
  userHandle: z.string().optional(),
  signCount: z.number(),
});

export type StoredPasskeyCredential = z.infer<
  typeof storedPasskeyCredentialSchema
>;

const passkeyFileSchema = z.object({
  credentials: z.array(storedPasskeyCredentialSchema),
});

/**
 * Read/write access to the passkeys the preview browser has registered.
 */
export interface PasskeyCredentialStore {
  list(): StoredPasskeyCredential[];
  save(credential: StoredPasskeyCredential): void;
}

/**
 * Stores passkeys registered inside the preview browser.
 *
 * The virtual authenticator is destroyed whenever the debugger detaches or the
 * tab navigates cross-origin, and a fresh one starts empty, so credentials have
 * to live here rather than in Chromium. Tabs share the
 * `persist:browser-content` session, so this is a single process-wide store.
 *
 * Private keys are written through safeStorage, matching how the app persists
 * its other credentials.
 */
export class PersistedPasskeyCredentialStore implements PasskeyCredentialStore {
  private static instance: PersistedPasskeyCredentialStore | null = null;

  private readonly logger: Logger;
  private credentials: StoredPasskeyCredential[];

  private constructor(logger: Logger) {
    this.logger = logger;
    this.credentials = readPersistedDataSync(
      'passkeys',
      passkeyFileSchema,
      { credentials: [] },
      { encrypt: true },
    ).credentials;
  }

  public static getInstance(logger: Logger): PersistedPasskeyCredentialStore {
    if (!PersistedPasskeyCredentialStore.instance) {
      PersistedPasskeyCredentialStore.instance =
        new PersistedPasskeyCredentialStore(logger);
    }
    return PersistedPasskeyCredentialStore.instance;
  }

  public list(): StoredPasskeyCredential[] {
    return this.credentials;
  }

  public save(credential: StoredPasskeyCredential): void {
    const index = this.credentials.findIndex(
      (c) => c.credentialId === credential.credentialId,
    );
    if (index >= 0) this.credentials[index] = credential;
    else this.credentials.push(credential);

    try {
      writePersistedDataSync(
        'passkeys',
        passkeyFileSchema,
        { credentials: this.credentials },
        { encrypt: true },
      );
    } catch (err) {
      this.logger.error(`[PasskeyCredentialStore] Failed to persist: ${err}`);
    }
  }
}
