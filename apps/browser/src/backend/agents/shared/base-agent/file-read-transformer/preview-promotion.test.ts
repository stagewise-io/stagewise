/**
 * Tests for the preview-promotion feature in fileReadTransformer.
 *
 * When a preview request targets a small text file, the pipeline
 * promotes it to a full-content read. This saves a tool-call round-trip
 * and aligns the cache key with subsequent full reads.
 *
 * Gates:
 *   - must be in preview mode
 *   - must not be a directory
 *   - must not be a binary buffer
 *   - file size <= PREVIEW_PROMOTION_MAX_BYTES (6 KB)
 *   - line count <= PREVIEW_PROMOTION_MAX_LINES (150)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import nodeFs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { FileReadCacheService } from '@/services/file-read-cache';
import {
  fileReadTransformer,
  type FileReadTransformerOptions,
  PREVIEW_PROMOTION_MAX_BYTES,
  PREVIEW_PROMOTION_MAX_LINES,
} from './index';

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
// Test scaffolding (mirrors file-read-transformer.test.ts)
// ---------------------------------------------------------------------------

const testRoot = path.join(os.tmpdir(), 'frt-promotion-tests');

interface TestContext {
  cache: FileReadCacheService;
  workDir: string;
  mountPrefix: string;
  mountPaths: Map<string, string>;
  agentId: string;
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
  };
}

async function teardown(ctx: TestContext): Promise<void> {
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

function allText(parts: any[]): string {
  return parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text)
    .join('');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fileReadTransformer – preview promotion', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  // -------------------------------------------------------------------------
  // Promotion cases (small file → full read)
  // -------------------------------------------------------------------------

  it('promotes small text file preview to full content', async () => {
    const content = `${Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')}\n`;
    const filePath = path.join(ctx.workDir, 'small.txt');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/small.txt`, hash, { preview: true }),
    );

    const text = allText(result.parts);

    // Promoted → <content>, not <preview>
    expect(text).toContain('<content>');
    expect(text).toContain('</content>');
    expect(text).not.toContain('<preview>');

    // Full content delivered: all 20 lines present
    expect(text).toContain('1|line 1');
    expect(text).toContain('20|line 20');

    // No "more lines" truncation indicator
    expect(text).not.toMatch(/more lines/);
  });

  it('promotes small markdown file preview to full content', async () => {
    const content =
      '# Title\n\n' +
      Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1}.`).join('\n') +
      '\n';
    const filePath = path.join(ctx.workDir, 'doc.md');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/doc.md`, hash, { preview: true }),
    );

    const text = allText(result.parts);

    // Promoted → <content>, no heading outline
    expect(text).toContain('<content>');
    expect(text).not.toContain('<preview>');
    expect(text).not.toContain('<headings>');

    // Full content: all paragraphs present
    expect(text).toContain('Paragraph 1.');
    expect(text).toContain('Paragraph 30.');
  });

  it('promotes small source-code file preview — no AST outline emitted', async () => {
    const content =
      `import { foo } from './foo';\n\n` +
      `export function greet(name: string): string {\n` +
      `  return \`Hello, \${name}!\`;\n` +
      `}\n\n` +
      `export class AppRouter {\n` +
      `  handle(path: string): void {}\n` +
      `}\n`;
    const filePath = path.join(ctx.workDir, 'app.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/app.ts`, hash, { preview: true }),
    );

    const text = allText(result.parts);

    // Promoted → full content, no AST outline
    expect(text).toContain('<content>');
    expect(text).not.toContain('<outline>');
    expect(text).not.toContain('<preview>');
    expect(text).not.toContain('source-outline');

    // Full content delivered
    expect(text).toContain("import { foo } from './foo';");
    expect(text).toContain('export function greet');
    expect(text).toContain('export class AppRouter');
  });

  // -------------------------------------------------------------------------
  // Non-promotion cases (must still produce a preview)
  // -------------------------------------------------------------------------

  it('does NOT promote a file exceeding the line threshold', async () => {
    // 300 lines > 150-line threshold
    const content = `${Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join('\n')}\n`;
    const filePath = path.join(ctx.workDir, 'big.txt');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/big.txt`, hash, { preview: true }),
    );

    const text = allText(result.parts);

    // Still in preview mode
    expect(text).toContain('<preview>');
    expect(text).not.toContain('<content>');

    // Truncation indicator present
    expect(text).toMatch(/more lines/);
  });

  it('does NOT promote a file exceeding the byte threshold', async () => {
    // 20 lines but each very long → exceeds 6 KB byte threshold
    const longLine = 'x'.repeat(500);
    const content = `${Array.from({ length: 20 }, () => longLine).join('\n')}\n`;
    const filePath = path.join(ctx.workDir, 'long-lines.txt');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    expect(content.length).toBeGreaterThan(PREVIEW_PROMOTION_MAX_BYTES);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/long-lines.txt`, hash, {
        preview: true,
      }),
    );

    const text = allText(result.parts);

    // Still in preview mode — byte check blocked promotion
    expect(text).toContain('<preview>');
    expect(text).not.toContain('<content>');
  });

  it('does NOT promote a binary buffer with source-code extension', async () => {
    // 1 KB binary buffer with a .ts extension
    const bytes = Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256));
    // Force a null byte pattern that triggers isBinaryBuffer
    bytes[10] = 0x00;
    bytes[20] = 0x00;
    bytes[30] = 0x00;

    const filePath = path.join(ctx.workDir, 'blob.ts');
    await nodeFs.writeFile(filePath, bytes);
    const hash = sha256(bytes);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/blob.ts`, hash, { preview: true }),
    );

    const text = allText(result.parts);

    // Binary guard kicks in — message from textTransformer
    expect(text).toContain('Binary file');
    expect(text).toContain('sandbox');
    expect(text).not.toContain('<content>');
  });

  it('does NOT promote a line-range read (no preview flag)', async () => {
    const content = `${Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')}\n`;
    const filePath = path.join(ctx.workDir, 'range.txt');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/range.txt`, hash, {
        startLine: 5,
        endLine: 10,
      }),
    );

    const text = allText(result.parts);

    // Line-range read — not a preview, so promotion doesn't apply.
    // Content is sliced to lines 5-10.
    expect(text).toContain('<content>');
    expect(text).toContain('5|line 5');
    expect(text).toContain('10|line 10');
    expect(text).not.toMatch(/^1\|/m);
  });

  // -------------------------------------------------------------------------
  // Threshold sanity checks
  // -------------------------------------------------------------------------

  it('exports sensible threshold constants', () => {
    // Sanity: constants match plan-approved values.
    expect(PREVIEW_PROMOTION_MAX_BYTES).toBe(6 * 1024);
    expect(PREVIEW_PROMOTION_MAX_LINES).toBe(150);
  });

  // -------------------------------------------------------------------------
  // Cache-key alignment: promoted preview + later full read share a key
  // -------------------------------------------------------------------------

  it('promoted preview shares cache key with subsequent full read', async () => {
    const content = `${Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join('\n')}\n`;
    const filePath = path.join(ctx.workDir, 'shared.txt');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    // First: promoted preview request
    const r1 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/shared.txt`, hash, { preview: true }),
    );

    // Second: explicit full read
    const r2 = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/shared.txt`, hash, {}),
    );

    const t1 = allText(r1.parts);
    const t2 = allText(r2.parts);

    // Both should be identical full-content reads (same cache key).
    expect(t1).toBe(t2);
    expect(t1).toContain('<content>');
    expect(t1).not.toContain('<preview>');
  });
});
