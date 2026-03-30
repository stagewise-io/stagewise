/**
 * Tests for content limits / truncation in text-based transformers.
 *
 * Verifies that:
 * 1. Large files are truncated at the configurable char-budget limit.
 * 2. Line-range requests exceeding the budget are capped.
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
  setMaxReadChars,
  setMaxPreviewLines,
  getMaxReadChars,
  getMaxPreviewLines,
} from './format-utils';

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
  origMaxReadChars: number;
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
    origMaxReadChars: getMaxReadChars(),
    origMaxPreview: getMaxPreviewLines(),
  };
}

async function teardown(ctx: TestContext): Promise<void> {
  // Restore original limits.
  setMaxReadChars(ctx.origMaxReadChars);
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

/**
 * Width of every generated line (excluding the newline).
 * Using a fixed-width format so that budget calculations are
 * exact regardless of which range of lines is being read.
 */
const LINE_WIDTH = 30;

/**
 * Generate a file with N lines, each exactly LINE_WIDTH characters long.
 * Format: "line NNNN " padded with dots to fill.
 */
function generateLines(n: number): string {
  return Array.from({ length: n }, (_, i) => {
    const prefix = `line ${String(i + 1).padStart(4, '0')} `;
    return prefix + '.'.repeat(LINE_WIDTH - prefix.length);
  }).join('\n');
}

/**
 * Compute a char budget that fits exactly `n` of the generated lines.
 * Each line is exactly LINE_WIDTH chars + 1 for the newline separator
 * used by `countLinesFittingBudget`.
 */
function budgetForLines(n: number): number {
  return n * (LINE_WIDTH + 1);
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

  it('truncates a full read when file exceeds char budget', async () => {
    // Budget for 10 lines — file has 25 lines.
    setMaxReadChars(budgetForLines(10));

    const content = generateLines(25);
    const filePath = path.join(ctx.workDir, 'big.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/big.ts`, hash),
    );
    const text = allText(result.parts);

    // Should contain lines 1-10 but not line 11.
    expect(text).toContain('1|line 0001');
    expect(text).toContain('10|line 0010');
    expect(text).not.toContain('11|line 0011');

    // Should show truncation indicator.
    expect(text).toContain('truncated');
    expect(text).toContain('more lines remaining');

    // effectiveReadParams should reflect the actual range delivered.
    expect(result.effectiveReadParams).toEqual({
      startLine: 1,
      endLine: 10,
    });
  });

  it('does not truncate when file fits within char budget', async () => {
    // Budget for 50 lines — file has only 10.
    setMaxReadChars(budgetForLines(50));

    const content = generateLines(10);
    const filePath = path.join(ctx.workDir, 'small.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/small.ts`, hash),
    );
    const text = allText(result.parts);

    // All lines present.
    expect(text).toContain('1|line 0001');
    expect(text).toContain('10|line 0010');
    expect(text).not.toContain('truncated');

    // No effectiveReadParams narrowing needed.
    expect(result.effectiveReadParams).toBeUndefined();
  });

  it('truncates SVG files at char budget', async () => {
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
    // Budget enough for the first 5 SVG lines only.
    const budget5 = svgLines
      .slice(0, 5)
      .reduce((acc, l) => acc + l.length + 1, 0);
    setMaxReadChars(budget5);

    const content = svgLines.join('\n');
    const filePath = path.join(ctx.workDir, 'big.svg');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/big.svg`, hash),
    );
    const text = allText(result.parts);

    expect(text).toContain('truncated');
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

  it('caps a line-range read at char budget from startLine', async () => {
    // Budget for 10 lines.
    setMaxReadChars(budgetForLines(10));

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

    // Should contain lines 20-29 (10 lines fitting in the budget from startLine).
    expect(text).toContain('20|line 0020');
    expect(text).toContain('29|line 0029');
    expect(text).not.toContain('30|line 0030');

    // Should show truncation with remaining count.
    expect(text).toContain('truncated');
    expect(text).toContain('more lines until line 80');

    // effectiveReadParams reports what was actually delivered.
    expect(result.effectiveReadParams).toEqual({
      startLine: 20,
      endLine: 29,
    });
  });

  it('does not truncate line-range within char budget', async () => {
    // Budget for 50 lines — range is only 21 lines.
    setMaxReadChars(budgetForLines(50));

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
    expect(text).toContain('10|line 0010');
    expect(text).toContain('30|line 0030');
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
    expect(text).toContain('1|line 0001');
    expect(text).toContain('5|line 0005');
    expect(text).not.toContain('6|line 0006');
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

  it('setMaxReadChars rejects values < 1', () => {
    expect(() => setMaxReadChars(0)).toThrow('maxReadChars must be >= 1');
    expect(() => setMaxReadChars(-5)).toThrow('maxReadChars must be >= 1');
  });

  it('setMaxPreviewLines rejects values < 1', () => {
    expect(() => setMaxPreviewLines(0)).toThrow('maxPreviewLines must be >= 1');
  });

  it('changing maxReadChars affects subsequent reads (uses separate files to avoid cache)', async () => {
    // Each sub-test uses a different file name so the cache key differs,
    // isolating each from prior cached results.

    // 5-line budget
    setMaxReadChars(budgetForLines(5));
    const content1 = generateLines(20);
    await nodeFs.writeFile(path.join(ctx.workDir, 'cfg1.ts'), content1);
    const r1 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/cfg1.ts`, sha256(content1)),
    );
    expect(r1.effectiveReadParams).toEqual({ startLine: 1, endLine: 5 });

    // 15-line budget
    setMaxReadChars(budgetForLines(15));
    const content2 = generateLines(20);
    await nodeFs.writeFile(path.join(ctx.workDir, 'cfg2.ts'), content2);
    const r2 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/cfg2.ts`, sha256(content2)),
    );
    expect(r2.effectiveReadParams).toEqual({ startLine: 1, endLine: 15 });

    // Budget above file size — no truncation.
    setMaxReadChars(budgetForLines(100));
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
    setMaxReadChars(budgetForLines(10));

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

    expect(text2).toContain('11|line 0011');
    expect(text2).toContain('20|line 0020');
    expect(text2).not.toContain('1|line 0001');
  });

  it('sequential range reads each return correct content', async () => {
    setMaxReadChars(budgetForLines(10));

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
    expect(text1).toContain('1|line 0001');
    expect(text1).toContain('10|line 0010');
    expect(text1).not.toContain('11|');

    // Read lines 11-20.
    const r2 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/seq.ts`, hash, {
        startLine: 11,
        endLine: 20,
      }),
    );
    const text2 = allText(r2.parts);
    expect(text2).toContain('11|line 0011');
    expect(text2).toContain('20|line 0020');

    // Read lines 21-30.
    const r3 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/seq.ts`, hash, {
        startLine: 21,
        endLine: 30,
      }),
    );
    const text3 = allText(r3.parts);
    expect(text3).toContain('21|line 0021');
    expect(text3).toContain('30|line 0030');
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

  it('output never exceeds char budget regardless of request', async () => {
    const charBudget = budgetForLines(10);
    setMaxReadChars(charBudget);

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

    // Range read requesting 500 lines — should be capped by budget.
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
