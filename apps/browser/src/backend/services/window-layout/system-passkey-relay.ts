import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { app, screen } from 'electron';
import { DisposableService } from '../disposable';
import type { Logger } from '../logger';

/** Ceremonies wait on a human — scanning a QR code takes a while. */
const CEREMONY_TIMEOUT_MS = 180_000;
const LAUNCH_TIMEOUT_MS = 20_000;
const WINDOW = { width: 520, height: 680 };

/**
 * Browsers that ship a real platform authenticator, most preferred first.
 * Any Chromium with a remote debugging port will do; Chrome is just the one
 * most likely to be installed and signed in.
 */
function browserCandidates(): string[] {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  if (process.platform === 'win32') {
    const roots = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
    ].filter((r): r is string => Boolean(r));
    return roots.flatMap((root) => [
      path.join(root, 'Google/Chrome/Application/chrome.exe'),
      path.join(root, 'Microsoft/Edge/Application/msedge.exe'),
    ]);
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
}

function findBrowser(): string | null {
  return browserCandidates().find((p) => existsSync(p)) ?? null;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error('no port'))));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type RelayResult =
  | { ok: true; credential: unknown }
  | { ok: false; error: string };

/**
 * Decides whether a ceremony request may run, and for which origin.
 *
 * Kept separate from the IPC plumbing because this is the security boundary:
 * it is what stops a third-party iframe from obtaining an assertion for the
 * page that embeds it.
 */
export function authorizeCeremony(request: {
  kind: unknown;
  inBrowsingSession: boolean;
  isMainFrame: boolean;
  frameOrigin: string | null;
}): { ok: true; origin: string } | { ok: false; error: string } {
  // Only sign-ins are relayed. Registering through the helper browser would
  // write a passkey into the user's real keychain — and syncing it to every
  // device they own — for what is usually a page they are only testing.
  // Registration stays with the tab's own virtual authenticator.
  if (request.kind !== 'get') return { ok: false, error: 'BadRequest' };

  // Only browsing tabs relay; the app's own UI has no business here.
  if (!request.inBrowsingSession)
    return { ok: false, error: 'NotABrowsingTab' };

  // The override is injected into every frame and the preload runs in
  // subframes, so a third-party iframe can reach the handler. Answering it
  // with the tab's origin would hand that iframe an assertion for the page
  // embedding it — what the `publickey-credentials-get` permissions policy
  // exists to prevent.
  if (!request.isMainFrame) return { ok: false, error: 'NotAMainFrame' };

  // An opaque origin reports "null"; nothing but a real web origin may become
  // a URL the helper browser is pointed at.
  const origin = request.frameOrigin ?? '';
  if (!origin.startsWith('https://') && !origin.startsWith('http://'))
    return { ok: false, error: 'BadOrigin' };

  return { ok: true, origin };
}

/** CDP reports credential ids as standard base64; pages send base64url. */
function normalizeCredentialId(id: string): string {
  return id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Whether the tab's own virtual authenticator already holds the passkey the
 * page is asking for, in which case there is nothing to relay.
 *
 * A passkey registered inside the preview browser is the one the page means,
 * and it is the whole point of the virtual authenticator. Opening a window onto
 * the user's real passkeys to look for it would find nothing, so this decides
 * from what is actually stored rather than by letting a lookup fail first.
 */
export function shouldUseLocalAuthenticator(
  options: unknown,
  origin: string,
  stored: readonly { credentialId: string; rpId: string }[],
): boolean {
  const request = (options ?? {}) as {
    rpId?: unknown;
    allowCredentials?: unknown;
  };

  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    // Nothing to open a window onto; leave it with the native call.
    return true;
  }

  const rpId = typeof request.rpId === 'string' ? request.rpId : host;
  // WebAuthn only lets a page claim an rpId its own origin sits under, and the
  // native call rejects anything else with a SecurityError. Relaying one of
  // those instead would open a window and turn the choice of path into an
  // oracle: a page could ask with someone else's rpId and learn from the
  // answer whether this machine holds a passkey for that site.
  if (host !== rpId && !host.endsWith(`.${rpId}`)) return true;

  const local = stored.filter((credential) => credential.rpId === rpId);
  if (local.length === 0) return false;

  // An empty or absent list means any discoverable credential for the relying
  // party will do, and we hold one.
  const allowed = request.allowCredentials;
  if (!Array.isArray(allowed) || allowed.length === 0) return true;

  const ids = new Set(local.map((c) => normalizeCredentialId(c.credentialId)));
  return allowed.some(
    (descriptor: unknown) =>
      typeof (descriptor as { id?: unknown })?.id === 'string' &&
      ids.has(normalizeCredentialId((descriptor as { id: string }).id)),
  );
}

/** Runs inside the helper browser, on the relying party's own origin. */
const CEREMONY_SCRIPT = `(async (optionsJson) => {
  try {
    const options = PublicKeyCredential.parseRequestOptionsFromJSON(optionsJson);
    const credential = await navigator.credentials.get({ publicKey: options });
    if (!credential) return { ok: false, error: 'NotAllowedError' };
    return { ok: true, credential: credential.toJSON() };
  } catch (err) {
    return { ok: false, error: err && err.name ? err.name : String(err) };
  }
})`;

/**
 * Runs a WebAuthn ceremony in a real browser so the preview tab can use the
 * passkeys already on this machine.
 *
 * Electron ships Chromium's WebAuthn implementation with no platform
 * authenticator behind it, and the native one added in Electron 41
 * (`app.configureWebAuthn`) only reaches device-bound Secure Enclave
 * credentials, needs a `keychain-access-groups` entitlement, and does not exist
 * on the version we build against. The virtual authenticator covers registering
 * a passkey inside the preview browser, but it cannot see a passkey that
 * already lives in iCloud Keychain or on a phone.
 *
 * A real browser can see all of them. So the ceremony is forwarded to one: a
 * throwaway profile is opened on the relying party's own origin, the ceremony
 * runs there over CDP, and the resulting assertion comes back to the preview
 * tab. The assertion is signed over the challenge the site issued and over that
 * same origin, so the site verifies it exactly as if it had been produced here.
 * Only the ceremony is relayed — cookies, storage and the session stay in the
 * preview browser. Only sign-ins are relayed, too: see `authorizeCeremony`.
 *
 * The helper browser exists only for the length of one ceremony. Its remote
 * debugging port has no authentication, so keeping it open between sign-ins
 * would leave a window for any other local process to drive it.
 */
export class SystemPasskeyRelay extends DisposableService {
  private readonly logger: Logger;
  private readonly browserPath: string | null;

  private child: ChildProcess | null = null;
  private socket: WebSocket | null = null;
  private nextId = 0;
  private readonly pending = new Map<
    number,
    (message: Record<string, unknown>) => void
  >();
  /** Each ceremony owns the helper browser, so only one may run at a time. */
  private busy = false;
  /** Set by `cancel`, cleared by the next `run`. See `cancel`. */
  private cancelled = false;
  private readonly profileRoot: string;
  private profile: string | null = null;
  private ceremonyCount = 0;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    this.browserPath = findBrowser();
    this.profileRoot = path.join(
      app.getPath('userData'),
      'passkey-relay-profiles',
      String(process.pid),
    );
  }

  /** Whether a browser capable of running the ceremony exists on this machine. */
  public get available(): boolean {
    return this.browserPath !== null;
  }

  public get browserName(): string | null {
    return this.browserPath ? path.basename(this.browserPath) : null;
  }

  /** Whether a ceremony already owns the helper browser. */
  public get running(): boolean {
    return this.busy;
  }

  /**
   * Runs one ceremony for `origin` and returns the credential as JSON.
   *
   * `optionsJson` is the site's own `PublicKeyCredentialRequestOptions` with the
   * binary fields base64url-encoded, which is the shape
   * `parseRequestOptionsFromJSON` expects on the other side.
   */
  public async run(origin: string, optionsJson: unknown): Promise<RelayResult> {
    if (this.disposed) return { ok: false, error: 'RelayUnavailable' };
    if (!this.browserPath) return { ok: false, error: 'NoSystemBrowser' };
    // Queueing instead would let a window appear minutes later, over whatever
    // the user had moved on to. The caller falls back to the tab's own
    // authenticator, and a second attempt costs one more click.
    if (this.busy) return { ok: false, error: 'RelayBusy' };

    this.busy = true;
    this.cancelled = false;
    try {
      return await this.runCeremony(origin, optionsJson);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Abandons the ceremony in flight, if any.
   *
   * Closing the helper browser drops the CDP socket, which fails the pending
   * evaluation and lets the ceremony unwind normally. Used when the tab that
   * asked for the sign-in goes away and nobody is left to finish it.
   *
   * Stopping the browser is not enough on its own: for most of a ceremony's
   * life there is no browser to stop yet, or none that answers. The flag is
   * what the waiting loops check, so a cancel during the launch is not simply
   * lost — and does not leave them polling something already killed.
   */
  public cancel(): void {
    if (!this.busy) return;
    this.cancelled = true;
    this.stopBrowser();
  }

  private async runCeremony(
    origin: string,
    optionsJson: unknown,
  ): Promise<RelayResult> {
    try {
      await this.launch(origin);
      await this.waitForOrigin(origin);

      const evaluated = (await this.send('Runtime.evaluate', {
        expression: `${CEREMONY_SCRIPT}(${JSON.stringify(optionsJson)})`,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
        timeout: CEREMONY_TIMEOUT_MS,
      })) as { result?: { value?: RelayResult } };

      return evaluated.result?.value ?? { ok: false, error: 'NoResult' };
    } catch (err) {
      this.logger.warn(`[SystemPasskeyRelay] Ceremony failed: ${err}`);
      return { ok: false, error: 'RelayUnavailable' };
    } finally {
      this.stopBrowser();
    }
  }

  /**
   * Opens the helper browser directly on `origin` and attaches to its page.
   *
   * `--app` gives a window without tabs or an omnibox, so what the user sees is
   * a sign-in dialog rather than a second browser appearing from nowhere.
   */
  private async launch(origin: string): Promise<void> {
    if (!this.browserPath) throw new Error('no system browser');
    this.stopBrowser();

    const port = await freePort();
    // Picking a port is a trip through the event loop, and a cancel landing in
    // it would have found no browser to stop.
    if (this.cancelled) throw new Error('cancelled');
    // A profile of its own, thrown away after the ceremony: whatever the
    // relying party's page leaves behind — cookies, storage, cache — goes with
    // it, and nothing touches the user's real browser session. Passkeys live in
    // the OS keychain or on a phone rather than in the profile, so starting
    // from empty still reaches every one of them.
    //
    // The path is scoped to this process because a second stagewise sharing it
    // would hit Chrome's profile lock: the launch would hand off to the running
    // copy and exit, leaving nothing listening on the port we just picked.
    this.profile = path.join(this.profileRoot, String(++this.ceremonyCount));
    const bounds = screen.getPrimaryDisplay().workArea;

    const child = spawn(
      this.browserPath,
      [
        `--app=${origin}`,
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${this.profile}`,
        `--window-size=${WINDOW.width},${WINDOW.height}`,
        `--window-position=${Math.round(bounds.x + (bounds.width - WINDOW.width) / 2)},${Math.round(bounds.y + (bounds.height - WINDOW.height) / 2)}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--no-service-autorun',
        '--disable-background-networking',
        '--disable-sync',
      ],
      { stdio: 'ignore', detached: false },
    );
    this.child = child;
    // A ChildProcess with no 'error' listener rethrows, and a browser that
    // cannot be executed at all would take the main process down with it.
    child.on('error', (err) => {
      this.logger.warn(
        `[SystemPasskeyRelay] Helper browser could not be started: ${err}`,
      );
      this.forgetChild(child);
    });
    // Only if this is still the current child: a late exit from the previous
    // ceremony's browser would otherwise drop the handle to this one, and its
    // window would outlive every ceremony after it.
    child.on('exit', () => this.forgetChild(child));

    const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
    let pageSocketUrl: string | null = null;
    // A cancel kills the browser, so without the flag this would go on polling
    // a dead port for the whole launch timeout, holding the relay all the while.
    while (Date.now() < deadline && !pageSocketUrl && !this.cancelled) {
      await sleep(200);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        const targets = (await res.json()) as {
          type?: string;
          webSocketDebuggerUrl?: string;
        }[];
        pageSocketUrl =
          targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
            ?.webSocketDebuggerUrl ?? null;
      } catch {
        // Not listening yet.
      }
    }
    if (this.cancelled) throw new Error('cancelled');
    if (!pageSocketUrl) throw new Error('helper browser never opened a page');

    await this.connect(pageSocketUrl);
    this.logger.debug(`[SystemPasskeyRelay] Helper browser ready on ${origin}`);
  }

  /**
   * The helper browser will only mint an assertion for the origin its document
   * is actually on, so the ceremony must not start until it has arrived there.
   */
  private async waitForOrigin(origin: string): Promise<void> {
    for (let attempt = 0; attempt < 60 && !this.cancelled; attempt++) {
      const evaluated = (await this.send('Runtime.evaluate', {
        expression: 'location.origin',
        returnByValue: true,
      }).catch(() => null)) as { result?: { value?: string } } | null;
      if (evaluated?.result?.value === origin) return;
      await sleep(250);
    }
    throw new Error(`helper browser never reached ${origin}`);
  }

  private async connect(debuggerUrl: string): Promise<void> {
    const socket = new WebSocket(debuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('CDP socket failed'));
    });
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
      } & Record<string, unknown>;
      if (typeof message.id !== 'number') return;
      this.pending.get(message.id)?.(message);
      this.pending.delete(message.id);
    };
    socket.onclose = () => {
      // Same reason as the child process: a close arriving after the next
      // ceremony has connected belongs to the old socket, and must touch
      // neither the handle nor the commands the new one has in flight.
      if (this.socket !== socket) return;
      this.failPending('socket closed');
      this.socket = null;
    };
    this.socket = socket;
  }

  /**
   * Fails every command still in flight.
   *
   * The stored callbacks reject on an `error` member, so this is what unwinds a
   * ceremony whose browser has gone away. Waiting for `onclose` to do it would
   * not work: the socket closes a turn later, by which point `stopBrowser` has
   * already emptied the map, and the ceremony would sit on the `send` timeout —
   * holding the relay busy, and every other tab with it, for three minutes.
   */
  private failPending(reason: string): void {
    for (const settle of this.pending.values())
      settle({ error: { message: reason } });
    this.pending.clear();
  }

  /** Drops the handle to `child`, unless a later ceremony has replaced it. */
  private forgetChild(child: ChildProcess): void {
    if (this.child === child) this.child = null;
  }

  private send(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error('helper browser not connected'));

    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, CEREMONY_TIMEOUT_MS + 10_000);

      this.pending.set(id, (message) => {
        clearTimeout(timer);
        const error = message.error as { message?: string } | undefined;
        if (error) reject(new Error(error.message ?? method));
        else resolve(message.result);
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  private stopBrowser(): void {
    try {
      this.socket?.close();
    } catch {
      // Already gone.
    }
    this.socket = null;
    this.failPending('helper browser stopped');
    if (this.child && !this.child.killed) this.child.kill();
    this.child = null;
    this.discardProfile();
  }

  /**
   * Removes the profile the ceremony ran in, so the relying party's cookies and
   * storage do not outlive the sign-in that created them.
   */
  private discardProfile(): void {
    const profile = this.profile;
    this.profile = null;
    if (!profile) return;
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch (err) {
      // Chrome may still be releasing files; the whole root goes at teardown.
      this.logger.debug(
        `[SystemPasskeyRelay] Could not remove the helper profile yet: ${err}`,
      );
    }
  }

  protected onTeardown(): void {
    // Same reason the loops check it during a cancel: a ceremony in flight
    // while the app shuts down should stop, not keep polling a dead browser.
    this.cancelled = true;
    this.stopBrowser();
    try {
      rmSync(this.profileRoot, { recursive: true, force: true });
    } catch {
      // Nothing left to clean up on the next run either way.
    }
  }
}
