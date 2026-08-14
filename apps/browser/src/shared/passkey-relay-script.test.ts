import { describe, expect, it } from 'vitest';
import { PASSKEY_RELAY_MAIN_WORLD_SCRIPT } from './passkey-relay-script';

/**
 * The override runs as a string inside the page, where neither the compiler nor
 * the rest of this test suite can see it. What matters here is the one decision
 * it makes: whether a request is relayed to the helper browser or left to the
 * tab's own authenticator. Getting that wrong either opens a browser window the
 * user never asked for, or drops fields the ceremony needs.
 */
function install() {
  const listeners = new Set<(event: unknown) => void>();
  const posted: Record<string, unknown>[] = [];
  const nativeCalls: unknown[] = [];

  class FakePublicKeyCredential {}
  const window = {
    PublicKeyCredential: FakePublicKeyCredential,
    addEventListener: (_type: string, fn: (event: unknown) => void) =>
      listeners.add(fn),
    removeEventListener: (_type: string, fn: (event: unknown) => void) =>
      listeners.delete(fn),
    postMessage: (data: Record<string, unknown>) => posted.push(data),
  };
  const navigator = {
    credentials: {
      get: async (arg: unknown) => {
        nativeCalls.push(arg);
        return 'native';
      },
    },
  };

  new Function(
    'window',
    'navigator',
    'PublicKeyCredential',
    PASSKEY_RELAY_MAIN_WORLD_SCRIPT,
  )(window, navigator, FakePublicKeyCredential);

  return { window, navigator, posted, nativeCalls };
}

const request = (extra: Record<string, unknown> = {}) => ({
  publicKey: { challenge: new Uint8Array([1, 2, 3]), ...extra },
});

describe('the main-world credentials.get override', () => {
  it('relays an ordinary sign-in', async () => {
    const page = install();
    void page.navigator.credentials.get(request());
    await Promise.resolve();
    expect(page.posted.some((m) => m.__stagewisePasskeyRequest)).toBe(true);
    expect(page.nativeCalls).toHaveLength(0);
  });

  it('leaves mediation that asked for no UI to the tab authenticator', async () => {
    // Opening a browser window for autofill, or for a request that promised to
    // be silent, would be an ambush.
    for (const mediation of ['conditional', 'silent']) {
      const page = install();
      await page.navigator.credentials.get({ ...request(), mediation });
      expect(page.posted).toHaveLength(0);
      expect(page.nativeCalls).toHaveLength(1);
    }
  });

  it('leaves a nested binary extension to the tab authenticator', async () => {
    // prf.eval.first is a BufferSource two levels down. Relaying it would hand
    // JSON.stringify an ArrayBuffer, which flattens to {} — the ceremony would
    // run without the extension the site asked for and quietly return the
    // wrong assertion.
    const page = install();
    await page.navigator.credentials.get(
      request({
        extensions: { prf: { eval: { first: new Uint8Array([9]) } } },
      }),
    );
    expect(page.posted).toHaveLength(0);
    expect(page.nativeCalls).toHaveLength(1);
  });

  it('still relays extensions that carry no binary', async () => {
    const page = install();
    void page.navigator.credentials.get(
      request({
        extensions: { appid: 'https://example.com', credProps: true },
      }),
    );
    await Promise.resolve();
    expect(page.posted.some((m) => m.__stagewisePasskeyRequest)).toBe(true);
  });

  it('gives up on a ceremony the page aborts while it is running', async () => {
    const page = install();
    const controller = new AbortController();
    const result = page.navigator.credentials.get({
      ...request(),
      signal: controller.signal,
    });
    await Promise.resolve();
    expect(page.posted.some((m) => m.__stagewisePasskeyRequest)).toBe(true);

    controller.abort();
    // The helper window has to close with it, and the request falls back to the
    // native call, which is what rejects with the AbortError the page expects.
    expect(page.posted.some((m) => m.__stagewisePasskeyCancel)).toBe(true);
    await expect(result).resolves.toBe('native');
    expect(page.nativeCalls).toHaveLength(1);
  });

  it('does not wrap itself twice', async () => {
    const page = install();
    const wrapped = page.navigator.credentials.get;
    new Function(
      'window',
      'navigator',
      'PublicKeyCredential',
      PASSKEY_RELAY_MAIN_WORLD_SCRIPT,
    )(page.window, page.navigator, page.window.PublicKeyCredential);
    expect(page.navigator.credentials.get).toBe(wrapped);
  });
});
