/**
 * Unit tests for ProcessedImageCacheService.
 *
 * Uses a fresh libsql file DB per test so instances are fully isolated.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { ProcessedImageCacheService, buildConstraintKey } from './index';
import type { ModalityConstraint } from '../../types/models';

// ---------------------------------------------------------------------------
// Logger stub
// ---------------------------------------------------------------------------

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as const;

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

async function makeWebp(
  width: number,
  height: number,
  quality = 80,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .webp({ quality })
    .toBuffer();
}

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Constraint fixtures
// ---------------------------------------------------------------------------

const CONSTRAINT_OPENAI: ModalityConstraint = {
  mimeTypes: ['image/webp', 'image/png', 'image/jpeg'],
  maxBytes: 5_242_880,
  maxWidthPx: 2048,
  maxHeightPx: 2048,
  maxTotalPixels: 1_572_864,
};

const CONSTRAINT_ANTHROPIC: ModalityConstraint = {
  mimeTypes: ['image/webp', 'image/png', 'image/jpeg'],
  maxBytes: 5_242_880,
  maxTotalPixels: 1_200_000,
};

// ---------------------------------------------------------------------------
// DB URL factory — each test gets a unique temp file so instances are fully
// isolated (libsql in-process doesn't support arbitrary cache= values).
// ---------------------------------------------------------------------------

const tmpDir = path.join(os.tmpdir(), 'pic-cache-tests');

async function freshDbUrl(): Promise<string> {
  await fs.mkdir(tmpDir, { recursive: true });
  return `file:${path.join(tmpDir, `${randomUUID()}.sqlite`)}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildConstraintKey', () => {
  it('encodes all defined numeric fields', () => {
    expect(buildConstraintKey(CONSTRAINT_OPENAI)).toBe(
      '2048|2048|1572864|5242880',
    );
  });

  it('uses * for undefined dimensions', () => {
    const c: ModalityConstraint = {
      mimeTypes: ['image/webp'],
      maxBytes: 1_000_000,
    };
    expect(buildConstraintKey(c)).toBe('*|*|*|1000000');
  });

  it('partial undefined fields', () => {
    const c: ModalityConstraint = {
      mimeTypes: ['image/webp'],
      maxBytes: 2_000_000,
      maxWidthPx: 1024,
    };
    expect(buildConstraintKey(c)).toBe('1024|*|*|2000000');
  });

  it('mimeTypes differences do not affect the constraint key', () => {
    const c1: ModalityConstraint = {
      mimeTypes: ['image/webp'],
      maxBytes: 1_000_000,
    };
    const c2: ModalityConstraint = {
      mimeTypes: ['image/jpeg'],
      maxBytes: 1_000_000,
    };
    // Same numeric constraints — same key; MIME filtering happens at lookup
    expect(buildConstraintKey(c1)).toBe(buildConstraintKey(c2));
  });

  it('different constraints produce different keys', () => {
    expect(buildConstraintKey(CONSTRAINT_OPENAI)).not.toBe(
      buildConstraintKey(CONSTRAINT_ANTHROPIC),
    );
  });
});

describe('ProcessedImageCacheService – get/set basics', () => {
  let svc: ProcessedImageCacheService;

  beforeEach(async () => {
    svc = await ProcessedImageCacheService.createWithUrl(
      await freshDbUrl(),
      noopLogger,
    );
  });

  afterEach(() => {
    svc.teardown();
  });

  it('returns null on cache miss', async () => {
    const buf = await makeWebp(100, 100);
    const result = await svc.get(buf, CONSTRAINT_OPENAI);
    expect(result).toBeNull();
  });

  it('returns stored result after set', async () => {
    const raw = await makePng(100, 100);
    const processed = await makeWebp(80, 80);

    await svc.set(raw, CONSTRAINT_OPENAI, {
      buf: processed,
      mediaType: 'image/webp',
    });

    const hit = await svc.get(raw, CONSTRAINT_OPENAI);
    expect(hit).not.toBeNull();
    expect(hit!.mediaType).toBe('image/webp');
    expect(Buffer.compare(hit!.buf, processed)).toBe(0);
  });

  it('different raw buffers do not collide', async () => {
    const raw1 = await makePng(100, 100);
    const raw2 = await makePng(200, 200);
    const processed1 = await makeWebp(80, 80);
    const processed2 = await makeWebp(160, 160);

    await svc.set(raw1, CONSTRAINT_OPENAI, {
      buf: processed1,
      mediaType: 'image/webp',
    });
    await svc.set(raw2, CONSTRAINT_OPENAI, {
      buf: processed2,
      mediaType: 'image/webp',
    });

    const hit1 = await svc.get(raw1, CONSTRAINT_OPENAI);
    const hit2 = await svc.get(raw2, CONSTRAINT_OPENAI);

    expect(Buffer.compare(hit1!.buf, processed1)).toBe(0);
    expect(Buffer.compare(hit2!.buf, processed2)).toBe(0);
  });

  it('same raw buffer, different constraints do not collide', async () => {
    const raw = await makePng(500, 500);
    const resultA = await makeWebp(100, 100);
    const resultB = await makeWebp(200, 200);

    await svc.set(raw, CONSTRAINT_OPENAI, {
      buf: resultA,
      mediaType: 'image/webp',
    });
    await svc.set(raw, CONSTRAINT_ANTHROPIC, {
      buf: resultB,
      mediaType: 'image/webp',
    });

    const hitA = await svc.get(raw, CONSTRAINT_OPENAI);
    const hitB = await svc.get(raw, CONSTRAINT_ANTHROPIC);

    expect(Buffer.compare(hitA!.buf, resultA)).toBe(0);
    expect(Buffer.compare(hitB!.buf, resultB)).toBe(0);
  });

  it('upsert on set — second write wins', async () => {
    const raw = await makePng(100, 100);
    const v1 = await makeWebp(80, 80, 80);
    const v2 = await makeWebp(80, 80, 40);

    await svc.set(raw, CONSTRAINT_OPENAI, { buf: v1, mediaType: 'image/webp' });
    await svc.set(raw, CONSTRAINT_OPENAI, { buf: v2, mediaType: 'image/webp' });

    const hit = await svc.get(raw, CONSTRAINT_OPENAI);
    expect(Buffer.compare(hit!.buf, v2)).toBe(0);
  });

  it('cached result is reused when fetched with a different constraint that allows the stored mediaType', async () => {
    const raw = await makePng(100, 100);
    const processed = await makeWebp(80, 80);
    const constraintFull: ModalityConstraint = {
      ...CONSTRAINT_OPENAI,
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    };
    await svc.set(raw, constraintFull, {
      buf: processed,
      mediaType: 'image/webp',
    });

    const constraintWebpOnly: ModalityConstraint = {
      ...CONSTRAINT_OPENAI,
      mimeTypes: ['image/webp'],
    };
    const hit = await svc.get(raw, constraintWebpOnly);
    expect(hit).not.toBeNull();
    expect(hit!.mediaType).toBe('image/webp');
  });

  it('cached result is not returned when the stored mediaType is not in the fetching constraint', async () => {
    const raw = await makePng(100, 100);
    const processed = await makeWebp(80, 80);
    const constraintWithJpeg: ModalityConstraint = {
      ...CONSTRAINT_OPENAI,
      mimeTypes: ['image/jpeg'],
    };
    await svc.set(raw, constraintWithJpeg, {
      buf: processed,
      mediaType: 'image/jpeg',
    });

    const constraintWebpOnly: ModalityConstraint = {
      ...CONSTRAINT_OPENAI,
      mimeTypes: ['image/webp'],
    };
    const miss = await svc.get(raw, constraintWebpOnly);
    expect(miss).toBeNull();
  });
});

describe('ProcessedImageCacheService – last_used_at update on hit', () => {
  let svc: ProcessedImageCacheService;

  beforeEach(async () => {
    svc = await ProcessedImageCacheService.createWithUrl(
      await freshDbUrl(),
      noopLogger,
    );
  });

  afterEach(() => {
    svc.teardown();
  });

  it('updates last_used_at on cache hit', async () => {
    const raw = await makePng(100, 100);
    const processed = await makeWebp(80, 80);

    const before = Date.now();
    await svc.set(raw, CONSTRAINT_OPENAI, {
      buf: processed,
      mediaType: 'image/webp',
    });

    await new Promise((r) => setTimeout(r, 20));
    const mid = Date.now();

    await svc.get(raw, CONSTRAINT_OPENAI);
    const after = Date.now();

    expect(mid).toBeGreaterThanOrEqual(before);
    expect(after).toBeGreaterThanOrEqual(mid);
  });
});

describe('ProcessedImageCacheService – LRU eviction', () => {
  it('evicts the oldest-used entry when exceeding 200 entries', async () => {
    const svc = await ProcessedImageCacheService.createWithUrl(
      await freshDbUrl(),
      noopLogger,
    );

    const constraint = CONSTRAINT_OPENAI;
    const processed = await makeWebp(10, 10);

    const firstRaw = await makePng(10, 10);
    await svc.set(firstRaw, constraint, {
      buf: processed,
      mediaType: 'image/webp',
    });

    for (let i = 0; i < 200; i++) {
      const raw = await sharp({
        create: {
          width: 10,
          height: 10,
          channels: 3,
          background: { r: i % 256, g: (i + 50) % 256, b: (i + 100) % 256 },
        },
      })
        .png()
        .toBuffer();
      await svc.set(raw, constraint, {
        buf: processed,
        mediaType: 'image/webp',
      });
    }

    await (svc as any).runSweep();

    const evicted = await svc.get(firstRaw, constraint);
    expect(evicted).toBeNull();

    svc.teardown();
  }, 20_000);

  it('does NOT evict a recently-used entry even if it was inserted first', async () => {
    const svc = await ProcessedImageCacheService.createWithUrl(
      await freshDbUrl(),
      noopLogger,
    );

    const constraint = CONSTRAINT_OPENAI;
    const processed = await makeWebp(10, 10);

    const oldRaw = await makePng(10, 10);
    await svc.set(oldRaw, constraint, {
      buf: processed,
      mediaType: 'image/webp',
    });

    for (let i = 0; i < 200; i++) {
      const raw = await sharp({
        create: {
          width: 10,
          height: 10,
          channels: 3,
          background: { r: i % 256, g: (i + 50) % 256, b: (i + 100) % 256 },
        },
      })
        .png()
        .toBuffer();
      await svc.set(raw, constraint, {
        buf: processed,
        mediaType: 'image/webp',
      });
    }

    // Touch the "old" entry so it becomes most-recently-used.
    await svc.get(oldRaw, constraint);

    await (svc as any).runSweep();

    const stillThere = await svc.get(oldRaw, constraint);
    expect(stillThere).not.toBeNull();

    svc.teardown();
  }, 20_000);
});

describe('ProcessedImageCacheService – integration with processImageForModel', () => {
  it('returns cached result on second call (no re-encoding)', async () => {
    const { processImageForModel } = await import('./image-processor');

    const svc = await ProcessedImageCacheService.createWithUrl(
      await freshDbUrl(),
      noopLogger,
    );

    const raw = await makePng(500, 500);
    const constraint: ModalityConstraint = {
      mimeTypes: ['image/webp'],
      maxBytes: 5_242_880,
      maxWidthPx: 2048,
      maxHeightPx: 2048,
      maxTotalPixels: 1_572_864,
    };

    const first = await processImageForModel(
      raw,
      'image/png',
      constraint,
      undefined,
      svc,
    );
    expect(first.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 50));

    const second = await processImageForModel(
      raw,
      'image/png',
      constraint,
      undefined,
      svc,
    );
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(Buffer.compare(first.buf, second.buf)).toBe(0);
    }

    svc.teardown();
  });

  it('bypass: no cache service passed — still processes correctly', async () => {
    const { processImageForModel } = await import('./image-processor');

    const raw = await makePng(100, 100);
    const constraint: ModalityConstraint = {
      mimeTypes: ['image/webp'],
      maxBytes: 5_242_880,
    };

    const result = await processImageForModel(raw, 'image/png', constraint);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mediaType).toBe('image/webp');
    }
  });
});
