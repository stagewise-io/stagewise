import type { WebContents } from 'electron';
import type { Logger } from '../../logger';
import {
  type PasskeyCredentialStore,
  type StoredPasskeyCredential,
  storedPasskeyCredentialSchema,
} from './credential-store';

/**
 * Options for the software authenticator installed into each tab.
 *
 * `transport: 'internal'` makes it look like a platform authenticator, which is
 * what sites gate the "use a passkey" path on. Chromium's own passkey UI lives
 * in `//chrome` and is not compiled into Electron, so there is no dialog to
 * drive user presence and verification — both are simulated instead.
 */
const VIRTUAL_AUTHENTICATOR_OPTIONS = {
  protocol: 'ctap2',
  ctap2Version: 'ctap2_1',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  automaticPresenceSimulation: true,
  isUserVerified: true,
  defaultBackupEligibility: true,
  defaultBackupState: true,
} as const;

/**
 * Makes WebAuthn work in a browsing tab.
 *
 * Electron ships Chromium's WebAuthn implementation but none of the platform
 * authenticator integrations, so `navigator.credentials.create()` finds no
 * authenticator, never resolves and never rejects — the page's own `timeout` is
 * not applied either, so a passkey login just hangs forever.
 *
 * Attaching a CDP virtual authenticator gives those requests something to talk
 * to. It is a software authenticator: it can only see credentials registered
 * inside the preview browser, never the real passkeys on the machine, and
 * Chromium still enforces the usual origin/RP-ID binding on top of it.
 *
 * The authenticator is bound to the tab's CDP session, so it is lost on
 * debugger detach and on cross-origin navigation (both measured); it is
 * reinstalled on each, with the stored credentials seeded back in.
 */
export class TabPasskeyAuthenticator {
  private readonly webContents: WebContents;
  private readonly store: PasskeyCredentialStore;
  private readonly logger: Logger;

  private authenticatorId: string | null = null;
  private currentOrigin: string;
  private destroyed = false;
  /** In-flight install, so overlapping triggers don't add two authenticators. */
  private installing: Promise<void> | null = null;

  private readonly boundHandleDetach: () => void;
  private readonly boundHandleMessage: (
    event: Electron.Event,
    method: string,
    params: unknown,
  ) => void;
  private readonly boundHandleDidNavigate: (
    event: Electron.Event,
    url: string,
  ) => void;

  constructor(
    webContents: WebContents,
    store: PasskeyCredentialStore,
    logger: Logger,
  ) {
    this.webContents = webContents;
    this.store = store;
    this.logger = logger;
    this.currentOrigin = this.originOf(webContents.getURL());

    this.boundHandleDetach = () => this.handleDetach();
    this.boundHandleMessage = (_event, method, params) =>
      this.handleCdpMessage(method, params);
    this.boundHandleDidNavigate = (_event, url) => this.handleDidNavigate(url);

    this.webContents.debugger.on('detach', this.boundHandleDetach);
    this.webContents.debugger.on('message', this.boundHandleMessage);
    this.webContents.on('did-navigate', this.boundHandleDidNavigate);
  }

  /**
   * Installs the virtual authenticator and seeds it with stored credentials.
   * Safe to call repeatedly; a no-op while one is already installed.
   */
  public async install(): Promise<void> {
    if (this.installing) return this.installing;
    this.installing = this.doInstall().finally(() => {
      this.installing = null;
    });
    return this.installing;
  }

  private async doInstall(): Promise<void> {
    if (this.destroyed) return;
    if (this.webContents.isDestroyed()) return;

    const dbg = this.webContents.debugger;
    if (!dbg.isAttached()) {
      try {
        dbg.attach('1.3');
      } catch (err) {
        // DevTools holds the only debugger connection while it is open. Leave
        // the authenticator uninstalled; the next navigation retries.
        this.logger.debug(
          `[TabPasskeyAuthenticator] Cannot attach debugger: ${err}`,
        );
        return;
      }
    }

    try {
      await dbg.sendCommand('WebAuthn.enable', { enableUI: false });

      // Chrome allows exactly one internal authenticator per CDP session, so a
      // replacement can only be added once the previous one is gone. Detach
      // destroys it for us; a cross-origin navigation does not.
      const previous = this.authenticatorId;
      this.authenticatorId = null;
      if (previous) {
        try {
          await dbg.sendCommand('WebAuthn.removeVirtualAuthenticator', {
            authenticatorId: previous,
          });
        } catch {
          // Already destroyed with the old CDP session; nothing to release.
        }
      }

      const { authenticatorId } = (await dbg.sendCommand(
        'WebAuthn.addVirtualAuthenticator',
        { options: VIRTUAL_AUTHENTICATOR_OPTIONS },
      )) as { authenticatorId: string };

      if (this.destroyed) return;
      this.authenticatorId = authenticatorId;

      for (const credential of this.store.list()) {
        try {
          await dbg.sendCommand('WebAuthn.addCredential', {
            authenticatorId,
            credential,
          });
        } catch (err) {
          this.logger.warn(
            `[TabPasskeyAuthenticator] Failed to restore credential for ${credential.rpId}: ${err}`,
          );
        }
      }

      this.logger.debug(
        `[TabPasskeyAuthenticator] Installed ${authenticatorId} with ${this.store.list().length} credential(s)`,
      );
    } catch (err) {
      this.authenticatorId = null;
      this.logger.error(`[TabPasskeyAuthenticator] Install failed: ${err}`);
    }
  }

  /**
   * Detach destroys the virtual authenticator. Re-enabling the domain alone
   * does not bring it back, so install a fresh one.
   */
  private handleDetach(): void {
    if (this.destroyed) return;
    void this.install();
  }

  private handleDidNavigate(url: string): void {
    const origin = this.originOf(url);
    if (origin === this.currentOrigin) return;

    // A cross-origin navigation swaps the render frame and takes the
    // authenticator with it.
    this.currentOrigin = origin;
    void this.install();
  }

  private handleCdpMessage(method: string, params: unknown): void {
    if (
      method !== 'WebAuthn.credentialAdded' &&
      method !== 'WebAuthn.credentialAsserted'
    )
      return;

    const payload = params as {
      authenticatorId?: string;
      credential?: unknown;
    };
    if (payload?.authenticatorId !== this.authenticatorId) return;

    const existing = this.findStored(payload.credential);
    const parsed = storedPasskeyCredentialSchema.safeParse({
      ...existing,
      ...(payload.credential as Record<string, unknown>),
    });
    if (!parsed.success) {
      this.logger.warn(
        `[TabPasskeyAuthenticator] Ignoring unparsable credential from ${method}`,
      );
      return;
    }

    this.store.save(parsed.data);
  }

  /** Existing record for an incoming credential, to fill in omitted fields. */
  private findStored(credential: unknown): StoredPasskeyCredential | undefined {
    const credentialId = (credential as { credentialId?: unknown })
      ?.credentialId;
    if (typeof credentialId !== 'string') return undefined;
    return this.store.list().find((c) => c.credentialId === credentialId);
  }

  private originOf(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return '';
    }
  }

  public destroy(): void {
    this.destroyed = true;
    this.authenticatorId = null;
    this.webContents.debugger.off('detach', this.boundHandleDetach);
    this.webContents.debugger.off('message', this.boundHandleMessage);
    this.webContents.off('did-navigate', this.boundHandleDidNavigate);
  }
}
