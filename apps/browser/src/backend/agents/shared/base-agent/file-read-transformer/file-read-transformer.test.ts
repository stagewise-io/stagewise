/**
 * Integration tests for the fileReadTransformer() pipeline.
 *
 * Uses a real temp directory for files and a real SQLite cache DB per test
 * for full pipeline coverage (read → hash → cache → transform → XML wrap).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import nodeFs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { FileReadCacheService } from '@/services/file-read-cache';
import { fileReadTransformer, type FileReadTransformerOptions } from './index';
import { getMaxReadChars } from './format-utils';
import { serializeTransformResult } from './serialization';

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

const testRoot = path.join(os.tmpdir(), 'frt-tests');

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

/**
 * Build a blobReader that reads from the real filesystem, resolving mount
 * prefixes the same way the production code does.
 */
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
  originalFileName?: string,
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
    originalFileName,
    readParams,
  };
}

/** Extract the full concatenated text from all text parts. */
function allText(parts: any[]): string {
  return parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text)
    .join('');
}

// ---------------------------------------------------------------------------
// Tests: XML envelope structure
// ---------------------------------------------------------------------------

describe('fileReadTransformer – XML wrapping', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('wraps text file output in <file> XML with metadata', async () => {
    const content = 'export const foo = 42;\n';
    const filePath = path.join(ctx.workDir, 'foo.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/foo.ts`, hash),
    );

    const text = allText(result.parts);
    expect(text).toContain(`<file path="${ctx.mountPrefix}/foo.ts">`);
    expect(text).toContain('<metadata>');
    expect(text).toContain('</metadata>');
    expect(text).toContain('<content>');
    expect(text).toContain('</content>');
    expect(text).toContain('</file>');
    expect(text).toContain('language:typescript');
    expect(text).toContain(content);
  });

  it('uses <preview> instead of <content> in preview mode', async () => {
    const content = 'line 1\nline 2\nline 3\n';
    const filePath = path.join(ctx.workDir, 'prev.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/prev.ts`, hash, undefined, {
        preview: true,
      }),
    );

    const text = allText(result.parts);
    expect(text).toContain('<preview>');
    expect(text).toContain('</preview>');
    expect(text).not.toContain('<content>');
    expect(text).not.toContain('</content>');
  });

  it('merges opening XML with first text part to reduce part count', async () => {
    const content = 'hello';
    const filePath = path.join(ctx.workDir, 'hello.txt');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/hello.txt`, hash),
    );

    // For a text-only result, everything merges into a single text part.
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].type).toBe('text');
  });

  it('escapes special XML characters in path', async () => {
    // Create a file with chars that need XML escaping in the path.
    const dirName = 'dir&<test>';
    const dir = path.join(ctx.workDir, dirName);
    await nodeFs.mkdir(dir, { recursive: true });
    const content = 'test';
    await nodeFs.writeFile(path.join(dir, 'file.txt'), content);
    const hash = sha256(content);

    const mountedPath = `${ctx.mountPrefix}/${dirName}/file.txt`;
    const result = await fileReadTransformer(makeOpts(ctx, mountedPath, hash));

    const text = allText(result.parts);
    expect(text).toContain('&amp;');
    expect(text).toContain('&lt;');
    expect(text).toContain('&gt;');
    expect(text).not.toContain(`path="${mountedPath}"`);
  });
});

// ---------------------------------------------------------------------------
// Tests: text file handling (built-in fallback)
// ---------------------------------------------------------------------------

describe('fileReadTransformer – text files', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('infers language from extension and includes line count', async () => {
    const content = 'fn main() {\n  println!("hi");\n}\n';
    await nodeFs.writeFile(path.join(ctx.workDir, 'main.rs'), content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/main.rs`, hash),
    );
    const text = allText(result.parts);
    expect(text).toContain('language:rust');
    expect(text).toContain('lines:4');
  });

  it('handles empty file', async () => {
    await nodeFs.writeFile(path.join(ctx.workDir, 'empty.txt'), '');
    const hash = sha256('');

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/empty.txt`, hash),
    );
    const text = allText(result.parts);
    expect(text).toContain('<file');
    expect(text).toContain('size:0B');
  });

  it('uses originalFileName for extension inference on att/ style paths', async () => {
    const content = 'print("hello")\n';
    await nodeFs.writeFile(path.join(ctx.workDir, 'randomid'), content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/randomid`, hash, 'script.py'),
    );
    const text = allText(result.parts);
    expect(text).toContain('language:python');
  });

  it('omits language for unknown extensions', async () => {
    const content = 'some data';
    await nodeFs.writeFile(path.join(ctx.workDir, 'data.xyz987'), content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/data.xyz987`, hash),
    );
    const text = allText(result.parts);
    expect(text).not.toContain('language:');
  });
});

// ---------------------------------------------------------------------------
// Tests: binary file handling
// ---------------------------------------------------------------------------

describe('fileReadTransformer – binary files', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('detects binary content and returns a fallback message', async () => {
    // Write bytes that are not valid UTF-8.
    const buf = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe,
    ]);
    await nodeFs.writeFile(path.join(ctx.workDir, 'image.dat'), buf);
    const hash = sha256(buf);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/image.dat`, hash),
    );
    const text = allText(result.parts);
    expect(text).toContain('Unsupported binary file');
    expect(text).toContain('fs.readFile');
  });
});

// ---------------------------------------------------------------------------
// Tests: directory handling
// ---------------------------------------------------------------------------

describe('fileReadTransformer – directories', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('handles a directory path with the directory transformer', async () => {
    const dir = path.join(ctx.workDir, 'src');
    await nodeFs.mkdir(dir, { recursive: true });
    await nodeFs.writeFile(path.join(dir, 'a.ts'), 'a');
    await nodeFs.writeFile(path.join(dir, 'b.ts'), 'b');

    // Compute the directory hash the same way the pipeline does.
    const { hashDirectory } = await import('./hash');
    const hash = await hashDirectory(dir);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/src`, hash),
    );
    const text = allText(result.parts);
    expect(text).toContain('type:directory');
    // The real directory transformer produces a tree listing with entries.
    expect(text).toContain('a.ts');
    expect(text).toContain('b.ts');
    expect(text).toContain('entries:2');
  });
});

// ---------------------------------------------------------------------------
// Tests: error paths
// ---------------------------------------------------------------------------

describe('fileReadTransformer – error paths', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('returns error XML for unresolvable mount prefix', async () => {
    const result = await fileReadTransformer(
      makeOpts(ctx, 'nonexistent_mount/file.ts', 'abc'),
    );
    const text = allText(result.parts);
    expect(text).toContain('error:true');
    expect(text).toContain('Path could not be resolved');
  });

  it('returns error XML when file does not exist', async () => {
    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/missing.ts`, 'abc'),
    );
    const text = allText(result.parts);
    expect(text).toContain('error:true');
    expect(text).toContain('does not exist');
  });

  it('returns error XML when blobReader throws', async () => {
    const content = 'hello';
    await nodeFs.writeFile(path.join(ctx.workDir, 'guarded.ts'), content);
    const hash = sha256(content);

    const failingReader = async () => {
      throw new Error('access denied');
    };

    const result = await fileReadTransformer({
      ...makeOpts(ctx, `${ctx.mountPrefix}/guarded.ts`, hash),
      blobReader: failingReader,
    });
    const text = allText(result.parts);
    expect(text).toContain('error:true');
    expect(text).toContain('could not be read');
  });
});

// ---------------------------------------------------------------------------
// Tests: hash match → cache integration
// ---------------------------------------------------------------------------

describe('fileReadTransformer – cache integration (hash match)', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('populates cache on first call and returns cached on second call', async () => {
    const content = 'cached content';
    const filePath = path.join(ctx.workDir, 'cached.txt');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);
    const opts = makeOpts(ctx, `${ctx.mountPrefix}/cached.txt`, hash);

    // First call — transformer runs, cache populated.
    const r1 = await fileReadTransformer(opts);
    const text1 = allText(r1.parts);
    expect(text1).toContain(content);

    // Give fire-and-forget cache.set a moment to complete.
    await new Promise((r) => setTimeout(r, 50));

    // Verify cache was populated (key includes extension + content-limit suffix).
    const cacheKey = FileReadCacheService.buildCacheKey(
      hash,
      '.txt',
      `mrc=${getMaxReadChars()}`,
    );
    const cached = await ctx.cache.get(cacheKey);
    expect(cached).not.toBeNull();

    // Second call — should use cache (same result).
    const r2 = await fileReadTransformer(opts);
    const text2 = allText(r2.parts);
    expect(text2).toContain(content);
  });

  it('cache hit returns correct content even with corrupted cache entry', async () => {
    const content = 'real content';
    const filePath = path.join(ctx.workDir, 'corrupt.txt');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    // Manually write a corrupted cache entry using the composite key.
    const cacheKey = FileReadCacheService.buildCacheKey(
      hash,
      '.txt',
      `mrc=${getMaxReadChars()}`,
    );
    await ctx.cache.set(cacheKey, 'not valid json {{{{', content.length);

    // The pipeline should fall through to the transformer when
    // deserialization fails.
    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/corrupt.txt`, hash),
    );
    const text = allText(result.parts);
    expect(text).toContain(content);
  });
});

// ---------------------------------------------------------------------------
// Tests: hash mismatch → cache fallback
// ---------------------------------------------------------------------------

describe('fileReadTransformer – hash mismatch', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('returns cached old version when file changed but old hash is cached', async () => {
    const oldContent = 'version 1';
    const newContent = 'version 2';
    const oldHash = sha256(oldContent);

    // Pre-populate cache with the old version's transformed result.
    // Use the composite cache key (hash + extension) that the pipeline expects.
    const oldResult = {
      metadata: { size: '9B', modified: '2025-01-01T00:00:00Z' },
      parts: [{ type: 'text' as const, text: oldContent }],
    };
    const oldCacheKey = FileReadCacheService.buildCacheKey(
      oldHash,
      '.txt',
      `mrc=${getMaxReadChars()}`,
    );
    await ctx.cache.set(
      oldCacheKey,
      serializeTransformResult(oldResult),
      oldContent.length,
    );

    // Write the *new* content to disk.
    await nodeFs.writeFile(path.join(ctx.workDir, 'changed.txt'), newContent);

    // Request with the *old* expectedHash — hash won't match current file.
    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/changed.txt`, oldHash),
    );
    const text = allText(result.parts);
    // Should return the old cached content, not the new file content.
    expect(text).toContain(oldContent);
    expect(text).not.toContain(newContent);
  });

  it('returns version-unavailable error when mismatch and no cache', async () => {
    const content = 'current content';
    await nodeFs.writeFile(path.join(ctx.workDir, 'drifted.txt'), content);

    // Use a fake old hash that's not in the cache.
    const fakeOldHash = sha256('some old content that no longer exists');

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/drifted.txt`, fakeOldHash),
    );
    const text = allText(result.parts);
    expect(text).toContain('has changed');
    expect(text).toContain('no longer available');
  });
});

// ---------------------------------------------------------------------------
// Tests: formatBytes via metadata output
// ---------------------------------------------------------------------------

describe('fileReadTransformer – metadata formatting', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await teardown(ctx);
  });

  it('formats small file sizes with decimal precision', async () => {
    // 500 bytes → should be "500B"
    const content = 'x'.repeat(500);
    await nodeFs.writeFile(path.join(ctx.workDir, 'small.txt'), content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/small.txt`, hash),
    );
    const text = allText(result.parts);
    expect(text).toContain('size:500B');
  });

  it('formats KB-range file sizes', async () => {
    // 2048 bytes → "2.0KB" (val < 10 uses one decimal place)
    const content = 'y'.repeat(2048);
    await nodeFs.writeFile(path.join(ctx.workDir, 'medium.txt'), content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/medium.txt`, hash),
    );
    const text = allText(result.parts);
    expect(text).toMatch(/size:\d+(\.\d)?KB/);
  });

  it('includes modified timestamp in ISO format', async () => {
    const content = 'timestamped';
    const filePath = path.join(ctx.workDir, 'stamped.txt');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const result = await fileReadTransformer(
      makeOpts(ctx, `${ctx.mountPrefix}/stamped.txt`, hash),
    );
    const text = allText(result.parts);
    // Should contain an ISO date string (YYYY-MM-DD).
    expect(text).toMatch(/modified:\d{4}-\d{2}-\d{2}T/);
  });
});
