/**
 * Tests for the source-code transformer.
 *
 * Covers AST-based preview, line-based fallback, full/range reads,
 * and binary delegation. Requires `web-tree-sitter` and
 * `@vscode/tree-sitter-wasm` to be installed for the AST-specific
 * tests; those are skipped if WASM loading fails at suite startup.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { TransformerContext, ReadParams } from '../types';
import { sourceCodeTransformer } from './source-code';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {},
  verboseMode: false,
} as any;

function makeCtx(readParams: ReadParams = {}): TransformerContext {
  return {
    agentId: 'test-agent',
    mountPaths: new Map(),
    cache: {} as any,
    logger: noopLogger,
    readParams,
    maxReadChars: 500 * 80,
    maxPreviewLines: 30,
  };
}

function makeStats(buf: Buffer) {
  return {
    size: buf.length,
    mtime: new Date('2025-01-01T00:00:00Z'),
    isDirectory: false,
  };
}

function allText(parts: any[]): string {
  return parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text)
    .join('');
}

// ---------------------------------------------------------------------------
// Sample source code
// ---------------------------------------------------------------------------

// Filler to push fixture past the preview-promotion line threshold
// (150 lines). Without this, small fixtures get promoted to full
// reads and preview-specific assertions fail.
const TS_FILLER = Array.from(
  { length: 160 },
  (_, i) => `// filler comment line ${i + 1}`,
).join('\n');

const TS_SOURCE = `import { foo } from './foo';

export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export class AppRouter {
  private routes: Map<string, Function>;

  constructor() {
    this.routes = new Map();
  }

  handle(path: string): void {
    // handle route
  }

  use(middleware: Function): void {
    // use middleware
  }
}

export interface AppConfig {
  port: number;
  host: string;
}

export type Route = {
  path: string;
  handler: Function;
};

const INTERNAL_CONSTANT = 42;

enum Status {
  Active,
  Inactive,
}

${TS_FILLER}
`;

const PY_FILLER = Array.from(
  { length: 160 },
  (_, i) => `# filler comment line ${i + 1}`,
).join('\n');

const PY_SOURCE = `import os
from typing import Optional

def greet(name: str) -> str:
    return f"Hello, {name}!"

class AppRouter:
    def __init__(self):
        self.routes = {}

    def handle(self, path: str) -> None:
        pass

    def use(self, middleware) -> None:
        pass

class Config:
    port: int = 8080

${PY_FILLER}
`;

// ---------------------------------------------------------------------------
// Tests: AST-based preview
// ---------------------------------------------------------------------------

describe('sourceCodeTransformer', () => {
  // -------------------------------------------------------------------
  // One-time WASM environment probe.
  // Confirms that web-tree-sitter initialises and produces an AST
  // outline. When the probe fails (missing WASM, CI sandbox, etc.),
  // all AST-specific tests are skipped — visibly, via ctx.skip().
  // When the probe passes, every subsequent test hard-asserts on
  // outline output so regressions are never silently green.
  // -------------------------------------------------------------------
  let astAvailable = false;

  beforeAll(async () => {
    try {
      const buf = Buffer.from(TS_SOURCE);
      const ctx = makeCtx({ preview: true });
      const result = await sourceCodeTransformer(
        buf,
        'test/probe.ts',
        makeStats(buf),
        ctx,
      );
      astAvailable = allText(result.parts).includes('<outline>');
    } catch {
      astAvailable = false;
    }
    if (!astAvailable) {
      console.warn(
        'AST tests will be skipped — web-tree-sitter WASM not available in test env',
      );
    }
  });

  describe('preview mode — AST outline', () => {
    it('produces AST outline for TypeScript', async (ctx) => {
      if (!astAvailable) ctx.skip();

      const buf = Buffer.from(TS_SOURCE);
      const mCtx = makeCtx({ preview: true });
      const result = await sourceCodeTransformer(
        buf,
        'test/app.ts',
        makeStats(buf),
        mCtx,
      );
      const text = allText(result.parts);

      expect(text).toContain('<outline>');
      expect(text).toContain('</outline>');

      // Should contain key symbols with signatures
      expect(text).toContain('function greet(name: string): string');
      expect(text).toContain('class AppRouter');
      expect(text).toContain('interface AppConfig');
      expect(text).toContain('type Route');

      // Signatures preserve the source-level export keyword
      expect(text).toContain('export function greet');
      expect(text).toContain('export class AppRouter');

      // Should contain class member signatures (no "method" kind prefix)
      expect(text).toContain('handle(path: string): void');
      expect(text).toContain('use(middleware: Function): void');

      // Should NOT contain line-numbered content (outline-only)
      expect(text).not.toMatch(/^1\|/m);

      // Metadata should indicate source-outline format
      expect(result.metadata.format).toBe('source-outline');
      expect(result.metadata.language).toBe('typescript');
      expect(result.metadata.preview).toBe('true');

      // Should report effective read params
      expect(result.effectiveReadParams?.preview).toBe(true);
    });

    it('produces AST outline for Python', async (ctx) => {
      if (!astAvailable) ctx.skip();

      const buf = Buffer.from(PY_SOURCE);
      const mCtx = makeCtx({ preview: true });
      const result = await sourceCodeTransformer(
        buf,
        'test/app.py',
        makeStats(buf),
        mCtx,
      );
      const text = allText(result.parts);

      expect(text).toContain('<outline>');

      // Should contain signatures (Python: stripped trailing ':')
      expect(text).toContain('def greet(name: str) -> str');
      expect(text).toContain('class AppRouter');
      expect(text).toContain('class Config');

      // Class method signatures
      expect(text).toContain('def __init__(self)');
      expect(text).toContain('def handle(self, path: str) -> None');

      expect(result.metadata.language).toBe('python');
      expect(result.metadata.format).toBe('source-outline');
    });

    it('falls back to line-based preview on unsupported extension', async () => {
      const htmlSource = '<html><head><title>Hello</title></head></html>\n';
      const buf = Buffer.from(htmlSource);
      const ctx = makeCtx({ preview: true });

      // .html has no grammar → should fall through to line-based preview
      const result = await sourceCodeTransformer(
        buf,
        'test/index.html',
        makeStats(buf),
        ctx,
      );

      const text = allText(result.parts);

      // Should NOT contain an outline (no grammar for HTML)
      expect(text).not.toContain('<outline>');

      // Should contain line-numbered content
      expect(text).toMatch(/1\|/);

      expect(result.metadata.preview).toBe('true');
      // Should not have source-outline format
      expect(result.metadata.format).toBeUndefined();
    });

    it('falls back to line-based preview on parse failure', async () => {
      // A buffer that decodes as UTF-8 but is nonsensical for TS parsing.
      // Tree-sitter should still parse it (it's very tolerant), but
      // we test with an empty file which yields zero symbols.
      const buf = Buffer.from('');
      const ctx = makeCtx({ preview: true });

      const result = await sourceCodeTransformer(
        buf,
        'test/empty.ts',
        makeStats(buf),
        ctx,
      );

      const text = allText(result.parts);

      // Empty file → zero symbols → should fall through to line-based
      expect(text).not.toContain('<outline>');
      expect(result.metadata.preview).toBe('true');
    });
  });

  // -------------------------------------------------------------------------
  // Outline truncation — depth pruning
  // -------------------------------------------------------------------------

  describe('outline truncation', () => {
    it('prunes deeper members before dropping top-level symbols', async (ctx) => {
      if (!astAvailable) ctx.skip();

      const buf = Buffer.from(TS_SOURCE);
      // Use a tight budget: enough for top-level symbols (~250 chars)
      // but not the class members (~165 chars extra). This forces
      // depth pruning while keeping all 6 top-level symbols.
      const mCtx = makeCtx({ preview: true });
      mCtx.maxReadChars = 300;

      const result = await sourceCodeTransformer(
        buf,
        'test/app.ts',
        makeStats(buf),
        mCtx,
      );
      const text = allText(result.parts);

      expect(text).toContain('<outline>');

      // Top-level symbols should still be present
      expect(text).toContain('function greet');
      expect(text).toContain('class AppRouter');
      expect(text).toContain('interface AppConfig');
      expect(text).toContain('type Route');

      // Truncation notice should be present
      expect(text).toContain('outline truncated');
    });

    it('shows hard-cutoff notice when top-level alone exceeds budget', async (ctx) => {
      if (!astAvailable) ctx.skip();

      const buf = Buffer.from(TS_SOURCE);
      // Extremely tiny budget — can't even fit all top-level symbols.
      const mCtx = makeCtx({ preview: true });
      mCtx.maxReadChars = 150;

      const result = await sourceCodeTransformer(
        buf,
        'test/app.ts',
        makeStats(buf),
        mCtx,
      );
      const text = allText(result.parts);

      expect(text).toContain('<outline>');

      // Should show hard-cutoff notice
      expect(text).toContain('more top-level symbols not shown');
    });

    it('produces identical output when everything fits', async (ctx) => {
      if (!astAvailable) ctx.skip();

      const buf = Buffer.from(TS_SOURCE);
      // Very generous budget — nothing should be pruned.
      const mCtx = makeCtx({ preview: true });
      mCtx.maxReadChars = 100_000;

      const result = await sourceCodeTransformer(
        buf,
        'test/app.ts',
        makeStats(buf),
        mCtx,
      );
      const text = allText(result.parts);

      expect(text).toContain('<outline>');

      // No truncation notices
      expect(text).not.toContain('outline truncated');
      expect(text).not.toContain('not shown');

      // All symbols present including children
      expect(text).toContain('function greet');
      expect(text).toContain('class AppRouter');
      expect(text).toContain('handle(path: string)');
      expect(text).toContain('use(middleware: Function)');
    });
  });

  // -------------------------------------------------------------------------
  // Non-preview reads
  // -------------------------------------------------------------------------

  describe('non-preview reads', () => {
    it('full read returns line-numbered text', async () => {
      const buf = Buffer.from(TS_SOURCE);
      const ctx = makeCtx(); // no preview

      const result = await sourceCodeTransformer(
        buf,
        'test/app.ts',
        makeStats(buf),
        ctx,
      );

      const text = allText(result.parts);

      // Should have line numbers
      expect(text).toMatch(/^1\|/);
      expect(text).toContain("import { foo } from './foo';");

      // Should NOT have outline
      expect(text).not.toContain('<outline>');

      expect(result.metadata.language).toBe('typescript');
      expect(result.metadata.lines).toBeDefined();
    });

    it('line-range read returns sliced content', async () => {
      const buf = Buffer.from(TS_SOURCE);
      const ctx = makeCtx({ startLine: 3, endLine: 5 });

      const result = await sourceCodeTransformer(
        buf,
        'test/app.ts',
        makeStats(buf),
        ctx,
      );

      const text = allText(result.parts);

      // Should start at line 3
      expect(text).toMatch(/^3\|/);

      // Should NOT contain line 1 content
      expect(text).not.toContain('1|import');

      expect(result.effectiveReadParams?.startLine).toBe(3);
      expect(result.effectiveReadParams?.endLine).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Binary guard
  // -------------------------------------------------------------------------

  describe('binary guard', () => {
    it('delegates binary buffer to text transformer', async () => {
      // Create a buffer with null bytes (binary indicator)
      const binaryBuf = Buffer.from([
        0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x00, 0x00,
      ]);
      const ctx = makeCtx({ preview: true });

      const result = await sourceCodeTransformer(
        binaryBuf,
        'test/app.ts',
        makeStats(binaryBuf),
        ctx,
      );

      const text = allText(result.parts);

      // Should get the binary file message from text transformer
      expect(text).toContain('Binary file');
      expect(text).toContain('sandbox');
    });
  });
});
