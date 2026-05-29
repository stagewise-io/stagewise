import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-types';
import { LspClient } from './client';
import type { LspServerInfo } from './types';

/**
 * Construct an LspClient without spawning a server. The constructor is private
 * at the type level only (JS does not enforce it at runtime), so we bypass it
 * via a cast. `waitForDiagnostics` / `updateDiagnostics` depend solely on the
 * internal maps, the EventEmitter, and the static timeouts — no live
 * connection — so this is sufficient to exercise the wait/receipt logic.
 */
interface TestClient {
  waitForDiagnostics(filePath: string, minVersion?: number): Promise<void>;
  updateDiagnostics(
    filePath: string,
    diagnostics: Diagnostic[],
    version?: number,
  ): void;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  emit(event: string, ...args: unknown[]): boolean;
}

function makeClient(): TestClient {
  const serverInfo: LspServerInfo = {
    id: 'test',
    name: 'test',
    extensions: ['.x'],
    shouldActivate: async () => true,
    spawn: async () => undefined,
  };
  const logger = {
    debug() {},
    warn() {},
    error() {},
    info() {},
  };
  const Ctor = LspClient as unknown as new (
    serverInfo: LspServerInfo,
    logger: unknown,
    root: string,
    resolvedEnv?: Record<string, string> | null,
  ) => unknown;
  return new Ctor(serverInfo, logger, '/tmp/project', null) as TestClient;
}

const FILE = '/tmp/project/a.x';

function diag(message = 'warning'): Diagnostic {
  return {
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    message,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('LspClient.updateDiagnostics (receipt vs. change event)', () => {
  it('emits a receipt with the version on every publish but the change event only when the set changes', () => {
    const client = makeClient();
    const received: Array<[string, number | undefined]> = [];
    const changed: string[] = [];
    client.on('diagnosticsReceived', (p, v) =>
      received.push([p as string, v as number | undefined]),
    );
    client.on('diagnostics', (p) => changed.push(p as string));

    client.updateDiagnostics(FILE, [diag()], 1);
    client.updateDiagnostics(FILE, [diag()], 2); // identical content -> deduped

    // Receipt fires for both publishes (so a re-lint never hangs), carrying
    // the document version...
    expect(received).toEqual([
      [FILE, 1],
      [FILE, 2],
    ]);
    // ...but the deduped change event only fires once.
    expect(changed).toEqual([FILE]);
  });
});

describe('LspClient.waitForDiagnostics', () => {
  it('resolves shortly after a fresh receipt (debounce window)', async () => {
    vi.useFakeTimers();
    const client = makeClient();

    const p = client.waitForDiagnostics(FILE, 1);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });

    client.emit('diagnosticsReceived', FILE, 1);
    await vi.advanceTimersByTimeAsync(149);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(resolved).toBe(true);
  });

  it('ignores a stale lower-version publish and waits for the current version', async () => {
    vi.useFakeTimers();
    const client = makeClient();

    // Waiting for diagnostics produced for document version 5.
    const p = client.waitForDiagnostics(FILE, 5);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });

    // A delayed publish from an earlier analysis (version 3) must NOT complete
    // the wait — that would read stale diagnostics.
    client.emit('diagnosticsReceived', FILE, 3);
    await vi.advanceTimersByTimeAsync(200);
    expect(resolved).toBe(false);

    // The publish for the current content (version 5) completes it.
    client.emit('diagnosticsReceived', FILE, 5);
    await vi.advanceTimersByTimeAsync(150);
    expect(resolved).toBe(true);
  });

  it('fast-path resolves immediately when the current version was already published', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    // Server already published version 7 for this file (cached, current).
    client.updateDiagnostics(FILE, [diag()], 7);

    // An unchanged re-lint asks to wait for version 7 (the cached version):
    // the fast path resolves without waiting for a new publish that the server
    // will not send.
    let resolved = false;
    void client.waitForDiagnostics(FILE, 7).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('accepts version-less receipts (servers that do not echo a version)', async () => {
    vi.useFakeTimers();
    const client = makeClient();

    const p = client.waitForDiagnostics(FILE, 4);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });

    // No version on the receipt -> cannot correlate -> accepted as best effort.
    client.emit('diagnosticsReceived', FILE, undefined);
    await vi.advanceTimersByTimeAsync(150);
    expect(resolved).toBe(true);
  });

  it('falls back to the full timeout when no qualifying publish ever arrives', async () => {
    vi.useFakeTimers();
    const client = makeClient();

    const p = client.waitForDiagnostics(FILE, 9);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(2999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(resolved).toBe(true);
  });
});
