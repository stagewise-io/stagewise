import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabPasskeyAuthenticator } from './index';
import type {
  PasskeyCredentialStore,
  StoredPasskeyCredential,
} from './credential-store';

vi.mock('electron', () => ({}));

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function createStore(initial: StoredPasskeyCredential[] = []) {
  const credentials = [...initial];
  const store: PasskeyCredentialStore = {
    list: vi.fn(() => credentials),
    save: vi.fn((credential: StoredPasskeyCredential) => {
      const index = credentials.findIndex(
        (c) => c.credentialId === credential.credentialId,
      );
      if (index >= 0) credentials[index] = credential;
      else credentials.push(credential);
    }),
  };
  return { store, credentials };
}

function createWebContents(url = 'https://app.example.com/login') {
  // Chrome permits exactly one internal authenticator per CDP session; adding a
  // second without removing the first fails. The mock enforces that so a
  // reinstall which forgets to clean up is a test failure, not a silent one.
  let live: string | null = null;
  let nextId = 1;
  let gate: Promise<void> | null = null;
  const dbg = Object.assign(new EventEmitter(), {
    isAttached: vi.fn(() => true),
    attach: vi.fn(),
    sendCommand: vi.fn(async (method: string, params?: unknown) => {
      if (gate) await gate;
      if (method === 'WebAuthn.addVirtualAuthenticator') {
        if (live)
          throw new Error(
            'Chrome only supports one internal authenticator per environment',
          );
        live = `auth-${nextId++}`;
        return { authenticatorId: live };
      }
      if (method === 'WebAuthn.removeVirtualAuthenticator') {
        const { authenticatorId } = params as { authenticatorId: string };
        if (live !== authenticatorId)
          throw new Error('Could not find a Virtual Authenticator matching ID');
        live = null;
      }
      return {};
    }),
    liveAuthenticatorId: () => live,
    /** Holds every CDP command open until the returned function is called. */
    blockCommands: () => {
      let release!: () => void;
      gate = new Promise<void>((resolve) => {
        release = () => {
          gate = null;
          resolve();
        };
      });
      return release;
    },
  });
  const wc = Object.assign(new EventEmitter(), {
    debugger: dbg,
    isDestroyed: vi.fn(() => false),
    getURL: vi.fn(() => url),
  });
  return wc as unknown as Electron.WebContents & {
    debugger: typeof dbg;
    emit: EventEmitter['emit'];
  };
}

const sentMethods = (wc: ReturnType<typeof createWebContents>) =>
  wc.debugger.sendCommand.mock.calls.map((c) => c[0] as string);

const callsFor = (wc: ReturnType<typeof createWebContents>, method: string) =>
  wc.debugger.sendCommand.mock.calls.filter((c) => c[0] === method);

const sampleCredential: StoredPasskeyCredential = {
  credentialId: 'Y3JlZC1pZA==',
  rpId: 'app.example.com',
  isResidentCredential: true,
  privateKey: 'cHJpdmF0ZS1rZXk=',
  userHandle: 'dXNlci1oYW5kbGU=',
  signCount: 3,
};

describe('TabPasskeyAuthenticator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('installs a virtual authenticator so WebAuthn requests can complete', async () => {
    const wc = createWebContents();
    const { store } = createStore();

    const authenticator = new TabPasskeyAuthenticator(
      wc,
      store,
      logger as never,
    );
    await authenticator.install();

    expect(sentMethods(wc)).toContain('WebAuthn.enable');
    expect(sentMethods(wc)).toContain('WebAuthn.addVirtualAuthenticator');

    const [, enableParams] = callsFor(wc, 'WebAuthn.enable')[0]!;
    // Chromium's native WebAuthn UI is not compiled into Electron, so the
    // request would hang waiting for a dialog that can never render.
    expect(enableParams).toMatchObject({ enableUI: false });

    const [, addParams] = callsFor(wc, 'WebAuthn.addVirtualAuthenticator')[0]!;
    expect(addParams).toMatchObject({
      options: {
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        automaticPresenceSimulation: true,
        isUserVerified: true,
      },
    });
  });

  it('seeds previously stored credentials onto the new authenticator', async () => {
    const wc = createWebContents();
    const { store } = createStore([sampleCredential]);

    await new TabPasskeyAuthenticator(wc, store, logger as never).install();

    const added = callsFor(wc, 'WebAuthn.addCredential');
    expect(added).toHaveLength(1);
    expect(added[0]![1]).toMatchObject({
      authenticatorId: 'auth-1',
      credential: sampleCredential,
    });
  });

  it('persists credentials created and asserted by the page', async () => {
    const wc = createWebContents();
    const { store, credentials } = createStore();

    const authenticator = new TabPasskeyAuthenticator(
      wc,
      store,
      logger as never,
    );
    await authenticator.install();

    wc.debugger.emit('message', {}, 'WebAuthn.credentialAdded', {
      authenticatorId: 'auth-1',
      credential: sampleCredential,
    });
    expect(credentials).toEqual([sampleCredential]);

    wc.debugger.emit('message', {}, 'WebAuthn.credentialAsserted', {
      authenticatorId: 'auth-1',
      credential: { ...sampleCredential, signCount: 4 },
    });
    expect(credentials).toEqual([{ ...sampleCredential, signCount: 4 }]);
  });

  it('reinstalls after the debugger detaches and reattaches', async () => {
    const wc = createWebContents();
    const { store } = createStore();

    const authenticator = new TabPasskeyAuthenticator(
      wc,
      store,
      logger as never,
    );
    await authenticator.install();
    expect(callsFor(wc, 'WebAuthn.addVirtualAuthenticator')).toHaveLength(1);

    // Detaching destroys the virtual authenticator; re-enabling alone does not
    // bring it back, so the authenticator has to be added again.
    wc.debugger.emit('detach');
    await vi.waitFor(() =>
      expect(callsFor(wc, 'WebAuthn.addVirtualAuthenticator')).toHaveLength(2),
    );

    authenticator.destroy();
  });

  it('reinstalls after DevTools closes', async () => {
    const wc = createWebContents();
    const { store } = createStore();

    const authenticator = new TabPasskeyAuthenticator(
      wc,
      store,
      logger as never,
    );
    await authenticator.install();
    expect(callsFor(wc, 'WebAuthn.addVirtualAuthenticator')).toHaveLength(1);

    // Closing DevTools disables the virtual authenticator environment without
    // detaching the debugger or navigating, so nothing else triggers a rebuild.
    wc.emit('devtools-closed');
    await vi.waitFor(() =>
      expect(callsFor(wc, 'WebAuthn.addVirtualAuthenticator')).toHaveLength(2),
    );

    authenticator.destroy();
  });

  it('reinstalls after a cross-origin navigation but not a same-origin one', async () => {
    const wc = createWebContents('https://app.example.com/login');
    const { store } = createStore();

    const authenticator = new TabPasskeyAuthenticator(
      wc,
      store,
      logger as never,
    );
    await authenticator.install();

    wc.emit('did-navigate', {}, 'https://app.example.com/dashboard');
    await vi.waitFor(() =>
      expect(callsFor(wc, 'WebAuthn.addVirtualAuthenticator')).toHaveLength(1),
    );

    wc.emit('did-navigate', {}, 'https://other.example.org/');
    await vi.waitFor(() =>
      expect(callsFor(wc, 'WebAuthn.addVirtualAuthenticator')).toHaveLength(2),
    );

    authenticator.destroy();
  });

  it('removes the previous authenticator before adding its replacement', async () => {
    const wc = createWebContents();
    const { store } = createStore([sampleCredential]);

    const authenticator = new TabPasskeyAuthenticator(
      wc,
      store,
      logger as never,
    );
    await authenticator.install();
    const first = wc.debugger.liveAuthenticatorId();
    expect(first).toBe('auth-1');

    wc.emit('did-navigate', {}, 'https://other.example.org/');
    await vi.waitFor(() =>
      expect(callsFor(wc, 'WebAuthn.addVirtualAuthenticator')).toHaveLength(2),
    );

    // Chrome refuses a second internal authenticator, so the reinstall must
    // drop the old one first or the tab is left with no working authenticator.
    expect(callsFor(wc, 'WebAuthn.removeVirtualAuthenticator')[0]![1]).toEqual({
      authenticatorId: first,
    });
    expect(wc.debugger.liveAuthenticatorId()).toBe('auth-2');
    expect(logger.error).not.toHaveBeenCalled();

    // stored credentials get seeded onto the replacement too
    expect(callsFor(wc, 'WebAuthn.addCredential')).toHaveLength(2);

    authenticator.destroy();
  });

  it('runs a reinstall requested while an install is still in flight', async () => {
    const wc = createWebContents();
    const { store } = createStore();

    const authenticator = new TabPasskeyAuthenticator(
      wc,
      store,
      logger as never,
    );

    const release = wc.debugger.blockCommands();
    const inFlight = authenticator.install();
    // The tab loses the authenticator this install is still building, so the
    // finished one is stale the moment it lands.
    wc.emit('did-navigate', {}, 'https://other.example.org/');
    release();
    await inFlight;

    await vi.waitFor(() =>
      expect(callsFor(wc, 'WebAuthn.addVirtualAuthenticator')).toHaveLength(2),
    );
    expect(logger.error).not.toHaveBeenCalled();

    authenticator.destroy();
  });

  it('does not send CDP commands once destroyed', async () => {
    const wc = createWebContents();
    const { store } = createStore();

    const authenticator = new TabPasskeyAuthenticator(
      wc,
      store,
      logger as never,
    );
    await authenticator.install();
    authenticator.destroy();

    const before = wc.debugger.sendCommand.mock.calls.length;
    wc.emit('did-navigate', {}, 'https://other.example.org/');
    await authenticator.install();

    expect(wc.debugger.sendCommand.mock.calls.length).toBe(before);
  });
});
