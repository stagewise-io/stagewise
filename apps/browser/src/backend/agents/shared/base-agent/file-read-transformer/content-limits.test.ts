/**
 * Tests for content limits / truncation in text-based transformers.
 *
 * Verifies that:
 * 1. Large files are truncated at the configurable max-read-lines limit.
 * 2. Line-range requests exceeding the limit are capped.
 * 3. Truncation is reported via `effectiveReadParams` so coverage tracking
 *    and cache keys work correctly — subsequent reads for later sections
 *    are not falsely suppressed.
 * 4. Preview mode respects the configurable max-preview-lines limit.
 * 5. Hard limits cannot be exceeded regardless of request params.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import nodeFs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { FileReadCacheService } from '@/services/file-read-cache';
import { fileReadTransformer, type FileReadTransformerOptions } from './index';
import {
  setMaxReadLines,
  setMaxPreviewLines,
  getMaxReadLines,
  getMaxPreviewLines,
} from './format-utils';
import { SeenFilesTracker } from './coverage';

// ---------------------------------------------------------------------------
// Stubs
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
// Test scaffolding
// ---------------------------------------------------------------------------

const testRoot = path.join(os.tmpdir(), 'frt-limits-tests');

interface TestContext {
  cache: FileReadCacheService;
  workDir: string;
  mountPrefix: string;
  mountPaths: Map<string, string>;
  agentId: string;
  /** Saved original limits to restore in afterEach. */
  origMaxRead: number;
  origMaxPreview: number;
}

async function setup(): Promise<TestContext> {
  const id = randomUUID().slice(0, 8);
  const workDir = path.join(testRoot, id);
  await nodeFs.mkdir(workDir, { recursive: true });

  const mountPrefix = `w${id.slice(0, 3)}`;

  const cache = await FileReadCacheService.createWithUrl(
    `file:${path.join(testRoot, `${id}.sqlite`)}`,
    noopLogger,
  );

  return {
    cache,
    workDir,
    mountPrefix,
    mountPaths: new Map([[mountPrefix, workDir]]),
    agentId: `agent-${id}`,
    origMaxRead: getMaxReadLines(),
    origMaxPreview: getMaxPreviewLines(),
  };
}

async function teardown(ctx: TestContext): Promise<void> {
  // Restore original limits.
  setMaxReadLines(ctx.origMaxRead);
  setMaxPreviewLines(ctx.origMaxPreview);
  await ctx.cache.teardown();
}

function sha256(content: string | Buffer): string {
  return createHash('sha256')
    .update(typeof content === 'string' ? Buffer.from(content) : content)
    .digest('hex');
}

function makeBlobReader(
  mountPaths: Map<string, string>,
): (agentId: string, mountedPath: string) => Promise<Buffer> {
  return async (_agentId: string, mountedPath: string) => {
    const slashIdx = mountedPath.indexOf('/');
    if (slashIdx <= 0) throw new Error(`Invalid path: ${mountedPath}`);
    const prefix = mountedPath.slice(0, slashIdx);
    const relative = mountedPath.slice(slashIdx + 1);
    const root = mountPaths.get(prefix);
    if (!root) throw new Error(`Unknown mount: ${prefix}`);
    return nodeFs.readFile(path.join(root, relative));
  };
}

function makeOpts(
  ctx: TestContext,
  mountedPath: string,
  expectedHash: string,
  readParams?: FileReadTransformerOptions['readParams'],
): FileReadTransformerOptions {
  return {
    mountedPath,
    expectedHash,
    blobReader: makeBlobReader(ctx.mountPaths),
    cache: ctx.cache,
    logger: noopLogger,
    agentId: ctx.agentId,
    mountPaths: ctx.mountPaths,
    readParams,
  };
}

/** Extract concatenated text from all text parts. */
function allText(parts: any[]): string {
  return parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text)
    .join('');
}

/** Generate a file with N numbered lines. */
function generateLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `line ${i + 1} content`).join(
    '\n',
  );
}

// ---------------------------------------------------------------------------
// Tests: Full read truncation
// ---------------------------------------------------------------------------

describe('content limits – full read truncation', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('truncates a full read when file exceeds maxReadLines', async () => {
    setMaxReadLines(10);

    const content = generateLines(25);
    const filePath = path.join(ctx.workDir, 'big.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/big.ts`, hash),
    );
    const text = allText(result.parts);

    // Should contain lines 1-10 but not line 11.
    expect(text).toContain('1|line 1 content');
    expect(text).toContain('10|line 10 content');
    expect(text).not.toContain('11|line 11 content');

    // Should show truncation indicator.
    expect(text).toContain('truncated at 10 lines');
    expect(text).toContain('15 more lines remaining');

    // effectiveReadParams should reflect the actual range delivered.
    expect(result.effectiveReadParams).toEqual({
      startLine: 1,
      endLine: 10,
    });
  });

  it('does not truncate when file fits within maxReadLines', async () => {
    setMaxReadLines(50);

    const content = generateLines(10);
    const filePath = path.join(ctx.workDir, 'small.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/small.ts`, hash),
    );
    const text = allText(result.parts);

    // All lines present.
    expect(text).toContain('1|line 1 content');
    expect(text).toContain('10|line 10 content');
    expect(text).not.toContain('truncated');

    // No effectiveReadParams narrowing needed.
    expect(result.effectiveReadParams).toBeUndefined();
  });

  it('truncates SVG files at maxReadLines', async () => {
    setMaxReadLines(5);

    const svgLines = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '  <rect x="0" y="0" width="100" height="100"/>',
      '  <rect x="10" y="10" width="80" height="80"/>',
      '  <circle cx="50" cy="50" r="40"/>',
      '  <line x1="0" y1="0" x2="100" y2="100"/>',
      '  <text x="50" y="50">Hello</text>',
      '  <path d="M0 0 L100 100"/>',
      '  <ellipse cx="50" cy="50" rx="40" ry="20"/>',
      '</svg>',
    ];
    const content = svgLines.join('\n');
    const filePath = path.join(ctx.workDir, 'big.svg');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/big.svg`, hash),
    );
    const text = allText(result.parts);

    expect(text).toContain('truncated at 5 lines');
    expect(result.effectiveReadParams).toEqual({
      startLine: 1,
      endLine: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Line-range truncation
// ---------------------------------------------------------------------------

describe('content limits – line-range truncation', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('caps a line-range read at maxReadLines from startLine', async () => {
    setMaxReadLines(10);

    const content = generateLines(100);
    const filePath = path.join(ctx.workDir, 'big.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/big.ts`, hash, {
        startLine: 20,
        endLine: 80,
      }),
    );
    const text = allText(result.parts);

    // Should contain lines 20-29 (10 lines from startLine).
    expect(text).toContain('20|line 20 content');
    expect(text).toContain('29|line 29 content');
    expect(text).not.toContain('30|line 30 content');

    // Should show truncation with remaining count.
    expect(text).toContain('truncated at 10 lines');
    expect(text).toContain('51 more lines until line 80');

    // effectiveReadParams reports what was actually delivered.
    expect(result.effectiveReadParams).toEqual({
      startLine: 20,
      endLine: 29,
    });
  });

  it('does not truncate line-range within maxReadLines', async () => {
    setMaxReadLines(50);

    const content = generateLines(100);
    const filePath = path.join(ctx.workDir, 'big.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/big.ts`, hash, {
        startLine: 10,
        endLine: 30,
      }),
    );
    const text = allText(result.parts);

    // All requested lines present.
    expect(text).toContain('10|line 10 content');
    expect(text).toContain('30|line 30 content');
    expect(text).not.toContain('truncated');
  });
});

// ---------------------------------------------------------------------------
// Tests: Preview mode respects configurable limit
// ---------------------------------------------------------------------------

describe('content limits – preview mode', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('preview respects maxPreviewLines', async () => {
    setMaxPreviewLines(5);

    const content = generateLines(50);
    const filePath = path.join(ctx.workDir, 'file.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/file.ts`, hash, { preview: true }),
    );
    const text = allText(result.parts);

    // Should show 5 preview lines + truncation indicator.
    expect(text).toContain('1|line 1 content');
    expect(text).toContain('5|line 5 content');
    expect(text).not.toContain('6|line 6 content');
    expect(text).toContain('45 more lines');
  });
});

// ---------------------------------------------------------------------------
// Tests: Configurable limits
// ---------------------------------------------------------------------------

describe('content limits – configurability', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('setMaxReadLines rejects values < 1', () => {
    expect(() => setMaxReadLines(0)).toThrow('maxReadLines must be >= 1');
    expect(() => setMaxReadLines(-5)).toThrow('maxReadLines must be >= 1');
  });

  it('setMaxPreviewLines rejects values < 1', () => {
    expect(() => setMaxPreviewLines(0)).toThrow('maxPreviewLines must be >= 1');
  });

  it('changing maxReadLines affects subsequent reads (uses separate files to avoid cache)', async () => {
    // Each sub-test uses a different file name so the cache key differs,
    // isolating each from prior cached results.

    // 5-line limit
    setMaxReadLines(5);
    const content1 = generateLines(20);
    await nodeFs.writeFile(path.join(ctx.workDir, 'cfg1.ts'), content1);
    const r1 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/cfg1.ts`, sha256(content1)),
    );
    expect(r1.effectiveReadParams).toEqual({ startLine: 1, endLine: 5 });

    // 15-line limit
    setMaxReadLines(15);
    const content2 = generateLines(20);
    await nodeFs.writeFile(path.join(ctx.workDir, 'cfg2.ts'), content2);
    const r2 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/cfg2.ts`, sha256(content2)),
    );
    expect(r2.effectiveReadParams).toEqual({ startLine: 1, endLine: 15 });

    // Limit above file size — no truncation.
    setMaxReadLines(100);
    const content3 = generateLines(20);
    await nodeFs.writeFile(path.join(ctx.workDir, 'cfg3.ts'), content3);
    const r3 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/cfg3.ts`, sha256(content3)),
    );
    expect(r3.effectiveReadParams).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: Cache key isolation — truncated reads don't poison later ranges
// ---------------------------------------------------------------------------

describe('content limits – cache key isolation', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('full read truncation does not cache-poison line-range reads', async () => {
    setMaxReadLines(10);

    const content = generateLines(30);
    const filePath = path.join(ctx.workDir, 'cached.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    // Full read — truncated to lines 1-10.
    const r1 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/cached.ts`, hash),
    );
    expect(r1.effectiveReadParams).toEqual({ startLine: 1, endLine: 10 });

    // Wait for cache write.
    await new Promise((r) => setTimeout(r, 50));

    // Read lines 11-20 — should get those lines, not the cached truncated result.
    const r2 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/cached.ts`, hash, {
        startLine: 11,
        endLine: 20,
      }),
    );
    const text2 = allText(r2.parts);

    expect(text2).toContain('11|line 11 content');
    expect(text2).toContain('20|line 20 content');
    expect(text2).not.toContain('1|line 1 content');
  });

  it('sequential range reads each return correct content', async () => {
    setMaxReadLines(10);

    const content = generateLines(30);
    const filePath = path.join(ctx.workDir, 'seq.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    // Read lines 1-10.
    const r1 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/seq.ts`, hash, {
        startLine: 1,
        endLine: 10,
      }),
    );
    const text1 = allText(r1.parts);
    expect(text1).toContain('1|line 1 content');
    expect(text1).toContain('10|line 10 content');
    expect(text1).not.toContain('11|');

    // Read lines 11-20.
    const r2 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/seq.ts`, hash, {
        startLine: 11,
        endLine: 20,
      }),
    );
    const text2 = allText(r2.parts);
    expect(text2).toContain('11|line 11 content');
    expect(text2).toContain('20|line 20 content');

    // Read lines 21-30.
    const r3 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/seq.ts`, hash, {
        startLine: 21,
        endLine: 30,
      }),
    );
    const text3 = allText(r3.parts);
    expect(text3).toContain('21|line 21 content');
    expect(text3).toContain('30|line 30 content');
  });
});

// ---------------------------------------------------------------------------
// Tests: Coverage tracker integration with truncation
// ---------------------------------------------------------------------------

describe('content limits – coverage tracker integration', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('truncated full read allows subsequent range requests through coverage', async () => {
    setMaxReadLines(10);

    const content = generateLines(30);
    const filePath = path.join(ctx.workDir, 'cov.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const tracker = new SeenFilesTracker();

    // Step 1: Full read — truncated to 1-10.
    const r1 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/cov.ts`, hash),
    );
    tracker.record(
      `${ctx.mountPrefix}/cov.ts`,
      hash,
      r1.effectiveReadParams ?? {},
    );

    // Step 2: Lines 5-8 should be covered (within delivered range).
    expect(
      tracker.isCovered(`${ctx.mountPrefix}/cov.ts`, hash, {
        startLine: 5,
        endLine: 8,
      }),
    ).toBe(true);

    // Step 3: Lines 11-20 should NOT be covered (beyond truncation).
    expect(
      tracker.isCovered(`${ctx.mountPrefix}/cov.ts`, hash, {
        startLine: 11,
        endLine: 20,
      }),
    ).toBe(false);

    // Step 4: Full file request should NOT be covered.
    expect(tracker.isCovered(`${ctx.mountPrefix}/cov.ts`, hash, {})).toBe(
      false,
    );

    // Step 5: Read 11-20, record, then check coverage again.
    const r2 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/cov.ts`, hash, {
        startLine: 11,
        endLine: 20,
      }),
    );
    tracker.record(
      `${ctx.mountPrefix}/cov.ts`,
      hash,
      r2.effectiveReadParams ?? { startLine: 11, endLine: 20 },
    );

    // Lines 15-18 now covered (within second read).
    expect(
      tracker.isCovered(`${ctx.mountPrefix}/cov.ts`, hash, {
        startLine: 15,
        endLine: 18,
      }),
    ).toBe(true);

    // Lines 21-30 still not covered.
    expect(
      tracker.isCovered(`${ctx.mountPrefix}/cov.ts`, hash, {
        startLine: 21,
        endLine: 30,
      }),
    ).toBe(false);
  });

  it('line-range truncation correctly narrows coverage', async () => {
    setMaxReadLines(10);

    const content = generateLines(100);
    const filePath = path.join(ctx.workDir, 'narrow.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const tracker = new SeenFilesTracker();

    // Request lines 50-80 — will be truncated to 50-59.
    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/narrow.ts`, hash, {
        startLine: 50,
        endLine: 80,
      }),
    );
    tracker.record(
      `${ctx.mountPrefix}/narrow.ts`,
      hash,
      result.effectiveReadParams ?? { startLine: 50, endLine: 80 },
    );

    // Lines 50-59 covered.
    expect(
      tracker.isCovered(`${ctx.mountPrefix}/narrow.ts`, hash, {
        startLine: 50,
        endLine: 59,
      }),
    ).toBe(true);

    // Lines 60-80 NOT covered.
    expect(
      tracker.isCovered(`${ctx.mountPrefix}/narrow.ts`, hash, {
        startLine: 60,
        endLine: 80,
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Hard limit enforcement
// ---------------------------------------------------------------------------

describe('content limits – hard limit enforcement', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('output never exceeds maxReadLines regardless of request', async () => {
    setMaxReadLines(10);

    const content = generateLines(1000);
    const filePath = path.join(ctx.workDir, 'huge.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    // Full read — should be capped.
    const r1 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/huge.ts`, hash),
    );
    const text1 = allText(r1.parts);
    const lineCount1 = text1.split('\n').filter((l) => /^\d+\|/.test(l)).length;
    expect(lineCount1).toBeLessThanOrEqual(10);

    // Range read requesting 500 lines — should be capped at 10.
    const r2 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/huge.ts`, hash, {
        startLine: 1,
        endLine: 500,
      }),
    );
    const text2 = allText(r2.parts);
    const lineCount2 = text2.split('\n').filter((l) => /^\d+\|/.test(l)).length;
    expect(lineCount2).toBeLessThanOrEqual(10);
  });
});
