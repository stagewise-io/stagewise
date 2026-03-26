/**
 * Unit tests for FileReadCacheService.
 *
 * Uses a unique temp-file-backed libsql DB per test so each test is fully
 * isolated with no shared state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { FileReadCacheService } from './index';

// ---------------------------------------------------------------------------
// Logger stub
// ---------------------------------------------------------------------------

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {},
  verboseMode: false,
} as any;

// ---------------------------------------------------------------------------
// DB URL factory — each test gets a unique temp file for full isolation.
// ---------------------------------------------------------------------------

const tmpDir = path.join(os.tmpdir(), 'file-read-cache-tests');

async function freshDbUrl(): Promise<string> {
  await fs.mkdir(tmpDir, { recursive: true });
  return `file:${path.join(tmpDir, `${randomUUID()}.sqlite`)}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileReadCacheService – get/set basics', () => {
  let svc: FileReadCacheService;

  beforeEach(async () => {
    svc = await FileReadCacheService.createWithUrl(
      await freshDbUrl(),
      noopLogger,
    );
  });

  afterEach(() => {
    svc.teardown();
  });

  it('returns null on cache miss', async () => {
    const result = await svc.get(sha256('nonexistent'));
    expect(result).toBeNull();
  });

  it('returns stored content after set', async () => {
    const raw = 'export const foo = 42;\n';
    const hash = sha256(raw);
    const transformed = '1 | export const foo = 42;\n';

    await svc.set(hash, transformed, raw.length);

    const hit = await svc.get(hash);
    expect(hit).not.toBeNull();
    expect(hit!.content).toBe(transformed);
    expect(hit!.sizeBytes).toBe(raw.length);
  });

  it('different hashes do not collide', async () => {
    const content1 = 'const a = 1;';
    const content2 = 'const b = 2;';
    const hash1 = sha256(content1);
    const hash2 = sha256(content2);
    const transformed1 = '1 | const a = 1;';
    const transformed2 = '1 | const b = 2;';

    await svc.set(hash1, transformed1, content1.length);
    await svc.set(hash2, transformed2, content2.length);

    const hit1 = await svc.get(hash1);
    const hit2 = await svc.get(hash2);

    expect(hit1!.content).toBe(transformed1);
    expect(hit2!.content).toBe(transformed2);
  });

  it('upsert on set — second write wins', async () => {
    const hash = sha256('original');
    const v1 = 'transformed v1';
    const v2 = 'transformed v2';

    await svc.set(hash, v1, 10);
    await svc.set(hash, v2, 10);

    const hit = await svc.get(hash);
    expect(hit!.content).toBe(v2);
  });

  it('stores and retrieves large content', async () => {
    const raw = 'x'.repeat(100_000);
    const hash = sha256(raw);
    const transformed = `1 | ${'x'.repeat(100_000)}`;

    await svc.set(hash, transformed, raw.length);

    const hit = await svc.get(hash);
    expect(hit).not.toBeNull();
    expect(hit!.content).toBe(transformed);
    expect(hit!.sizeBytes).toBe(100_000);
  });

  it('stores base64 encoded image data (post-transformation)', async () => {
    const fakeWebpBase64 = Buffer.from('fake-webp-image-data').toString(
      'base64',
    );
    const hash = sha256('raw-image-bytes');

    await svc.set(hash, fakeWebpBase64, 1024);

    const hit = await svc.get(hash);
    expect(hit).not.toBeNull();
    expect(hit!.content).toBe(fakeWebpBase64);
    expect(hit!.sizeBytes).toBe(1024);
  });
});

describe('FileReadCacheService – last_used_at update on hit', () => {
  let svc: FileReadCacheService;

  beforeEach(async () => {
    svc = await FileReadCacheService.createWithUrl(
      await freshDbUrl(),
      noopLogger,
    );
  });

  afterEach(() => {
    svc.teardown();
  });

  it('entry survives LRU eviction after being accessed', async () => {
    // Insert the "old" entry first
    const oldHash = sha256('old-content');
    await svc.set(oldHash, 'old-transformed', 10);

    // Small delay so timestamps differ
    await new Promise((r) => setTimeout(r, 20));

    // Insert 500 more entries to fill the cache to its limit
    for (let i = 0; i < 500; i++) {
      const h = sha256(`fill-${i}`);
      await svc.set(h, `content-${i}`, 10);
    }

    // Touch the old entry so it becomes most-recently-used
    const hit = await svc.get(oldHash);
    expect(hit).not.toBeNull();

    // Force LRU sweep
    await (svc as any).runSweep();

    // The old entry should survive because it was recently accessed
    const stillThere = await svc.get(oldHash);
    expect(stillThere).not.toBeNull();
    expect(stillThere!.content).toBe('old-transformed');
  });
});

describe('FileReadCacheService – LRU eviction', () => {
  it('evicts the least-recently-used entry when exceeding 500 entries', async () => {
    const svc = await FileReadCacheService.createWithUrl(
      await freshDbUrl(),
      noopLogger,
    );

    // Insert the first entry — this will be the least-recently-used
    const firstHash = sha256('first-entry');
    await svc.set(firstHash, 'first-transformed', 10);

    // Insert 500 more entries to exceed the limit
    for (let i = 0; i < 500; i++) {
      const h = sha256(`entry-${i}`);
      await svc.set(h, `content-${i}`, 10);
    }

    // Force LRU sweep
    await (svc as any).runSweep();

    // The first entry should have been evicted
    const evicted = await svc.get(firstHash);
    expect(evicted).toBeNull();

    // A recent entry should still be there
    const recent = await svc.get(sha256('entry-499'));
    expect(recent).not.toBeNull();
    expect(recent!.content).toBe('content-499');

    svc.teardown();
  });

  it('does not evict when under the limit', async () => {
    const svc = await FileReadCacheService.createWithUrl(
      await freshDbUrl(),
      noopLogger,
    );

    // Insert 10 entries — well under the 500 limit
    for (let i = 0; i < 10; i++) {
      const h = sha256(`small-${i}`);
      await svc.set(h, `content-${i}`, 10);
    }

    // Force sweep
    await (svc as any).runSweep();

    // All entries should survive
    for (let i = 0; i < 10; i++) {
      const hit = await svc.get(sha256(`small-${i}`));
      expect(hit).not.toBeNull();
      expect(hit!.content).toBe(`content-${i}`);
    }

    svc.teardown();
  });
});

describe('FileReadCacheService – teardown', () => {
  it('rejects operations after teardown', async () => {
    const svc = await FileReadCacheService.createWithUrl(
      await freshDbUrl(),
      noopLogger,
    );

    await svc.teardown();

    await expect(svc.get(sha256('anything'))).rejects.toThrow(/disposed/i);
    await expect(svc.set(sha256('anything'), 'data', 4)).rejects.toThrow(
      /disposed/i,
    );
  });

  it('double teardown is safe', async () => {
    const svc = await FileReadCacheService.createWithUrl(
      await freshDbUrl(),
      noopLogger,
    );

    await svc.teardown();
    await expect(svc.teardown()).resolves.toBeUndefined();
  });
});

describe('FileReadCacheService – creation', () => {
  it('creates a fresh database via createWithUrl', async () => {
    const svc = await FileReadCacheService.createWithUrl(
      await freshDbUrl(),
      noopLogger,
    );

    // Should start empty
    const miss = await svc.get(sha256('nothing'));
    expect(miss).toBeNull();

    svc.teardown();
  });

  it('reopening the same DB file preserves data', async () => {
    const url = await freshDbUrl();

    const svc1 = await FileReadCacheService.createWithUrl(url, noopLogger);
    const hash = sha256('persistent');
    await svc1.set(hash, 'persisted-content', 15);
    await svc1.teardown();

    const svc2 = await FileReadCacheService.createWithUrl(url, noopLogger);
    const hit = await svc2.get(hash);
    expect(hit).not.toBeNull();
    expect(hit!.content).toBe('persisted-content');
    expect(hit!.sizeBytes).toBe(15);

    await svc2.teardown();
  });
});
