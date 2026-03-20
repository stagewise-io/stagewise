import { describe, it, expect } from 'vitest';
import { capToolOutput } from './index';

function makeString(length: number, char = 'a'): string {
  return char.repeat(length);
}

function jsonByteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

describe('capToolOutput', () => {
  // ───────────────────── String truncation ─────────────────────

  describe('direct string input', () => {
    it('passes through a string under the byte limit', () => {
      const input = 'hello world';
      const result = capToolOutput(input, { maxBytes: 1024 });

      expect(result.truncated).toBe(false);
      expect(result.result).toBe(input);
      expect(result.cappedSize).toBe(result.originalSize);
    });

    it('truncates a string over the byte limit', () => {
      const input = makeString(200_000);
      const result = capToolOutput(input, { maxBytes: 1024 });

      expect(result.truncated).toBe(true);
      expect(result.result).toContain('... [truncated]');
      expect(jsonByteSize(result.result)).toBeLessThanOrEqual(1024);
      expect(result.cappedSize).toBeLessThanOrEqual(1024);
      expect(result.originalSize).toBeGreaterThan(1024);
    });

    it('passes through an empty string', () => {
      const result = capToolOutput('', { maxBytes: 1024 });

      expect(result.truncated).toBe(false);
      expect(result.result).toBe('');
    });

    it('passes through a string exactly at the byte limit', () => {
      const target = 1024;
      let str = 'x';
      while (jsonByteSize(`${str}x`) <= target) str += 'x';

      const result = capToolOutput(str, { maxBytes: target });

      expect(result.truncated).toBe(false);
      expect(result.result).toBe(str);
    });

    it('truncates a large string with the default 40KB limit', () => {
      const input = makeString(200_000);
      const result = capToolOutput(input);

      expect(result.truncated).toBe(true);
      expect(jsonByteSize(result.result)).toBeLessThanOrEqual(40 * 1024);
    });
  });

  // ────────────── Object with string properties ──────────────

  describe('object with string properties', () => {
    it('truncates a large content property while preserving other fields', () => {
      const input = {
        content: makeString(200_000),
        totalLines: 5000,
        linesRead: 5000,
      };
      const result = capToolOutput(input, { maxBytes: 2048 });

      expect(result.truncated).toBe(true);
      expect(result.result.totalLines).toBe(5000);
      expect(result.result.linesRead).toBe(5000);
      expect((result.result.content as string).length).toBeLessThan(200_000);
      expect(result.result.content).toContain('... [truncated]');
      expect(result.cappedSize).toBeLessThanOrEqual(2048);
    });

    it('truncates the largest string first when multiple strings exist', () => {
      const input = {
        large: makeString(50_000),
        small: makeString(100),
        medium: makeString(5_000),
      };
      const result = capToolOutput(input, { maxBytes: 2048 });

      expect(result.truncated).toBe(true);
      expect(result.result.large).toContain('... [truncated]');
      expect(result.cappedSize).toBeLessThanOrEqual(2048);
    });

    it('handles object with mixed string and array properties', () => {
      const input = {
        content: makeString(100_000),
        matches: Array.from({ length: 500 }, (_, i) => `match-${i}`),
        count: 500,
      };
      const result = capToolOutput(input, {
        maxBytes: 4096,
        maxItems: 10,
      });

      expect(result.truncated).toBe(true);
      expect((result.result.matches as string[]).length).toBeLessThanOrEqual(
        10,
      );
      expect(result.cappedSize).toBeLessThanOrEqual(4096);
    });

    it('does not truncate small string properties unnecessarily', () => {
      const input = {
        name: 'test-file.ts',
        content: makeString(200_000),
      };
      const result = capToolOutput(input, { maxBytes: 4096 });

      expect(result.result.name).toBe('test-file.ts');
      expect(result.result.content).toContain('... [truncated]');
    });
  });

  // ────────────────── Multi-byte UTF-8 ──────────────────

  describe('multi-byte UTF-8 handling', () => {
    it('does not produce invalid UTF-8 when truncating multi-byte chars', () => {
      const emoji = '\u{1F600}'; // 4-byte UTF-8 char
      const input = emoji.repeat(50_000);
      const result = capToolOutput(input, { maxBytes: 512 });

      expect(result.truncated).toBe(true);
      expect(result.result).not.toContain('\uFFFD');

      for (const char of result.result as string) {
        expect(char.codePointAt(0)).toBeDefined();
      }
    });

    it('handles CJK characters at the truncation boundary', () => {
      const cjk = '\u4E16\u754C'; // 3-byte UTF-8 chars each
      const input = cjk.repeat(50_000);
      const result = capToolOutput(input, { maxBytes: 512 });

      expect(result.truncated).toBe(true);
      expect(result.result).not.toContain('\uFFFD');
      expect(jsonByteSize(result.result)).toBeLessThanOrEqual(512);
    });

    it('handles mixed ASCII and multi-byte content', () => {
      const mixed = 'Hello \u{1F600} World \u4E16\u754C ';
      const input = mixed.repeat(20_000);
      const result = capToolOutput(input, { maxBytes: 1024 });

      expect(result.truncated).toBe(true);
      expect(result.result).not.toContain('\uFFFD');
      expect(jsonByteSize(result.result)).toBeLessThanOrEqual(1024);
    });

    it('truncates object string property with emoji without corruption', () => {
      const input = {
        content: '\u{1F680}'.repeat(100_000),
        lineCount: 42,
      };
      const result = capToolOutput(input, { maxBytes: 1024 });

      expect(result.truncated).toBe(true);
      expect(result.result.content).not.toContain('\uFFFD');
      expect(result.result.lineCount).toBe(42);
      expect(result.cappedSize).toBeLessThanOrEqual(1024);
    });
  });

  // ────────────── Array truncation (regression) ──────────────

  describe('array truncation (regression)', () => {
    it('truncates a direct array over maxBytes', () => {
      const input = Array.from(
        { length: 1000 },
        (_, i) => `item-${i}-${'x'.repeat(100)}`,
      );
      const result = capToolOutput(input, { maxBytes: 2048 });

      expect(result.truncated).toBe(true);
      expect(result.result.length).toBeLessThan(1000);
      expect(result.cappedSize).toBeLessThanOrEqual(2048);
      expect(result.itemsRemoved).toBeGreaterThan(0);
    });

    it('truncates a direct array over maxItems', () => {
      const input = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const result = capToolOutput(input, { maxItems: 10 });

      expect(result.truncated).toBe(true);
      expect(result.result.length).toBe(10);
      expect(result.itemsRemoved).toBe(90);
    });

    it('truncates object with array properties over maxBytes', () => {
      const input = {
        matches: Array.from(
          { length: 500 },
          (_, i) => `match-${i}-${'y'.repeat(200)}`,
        ),
      };
      const result = capToolOutput(input, { maxBytes: 4096 });

      expect(result.truncated).toBe(true);
      expect(result.result.matches.length).toBeLessThan(500);
      expect(result.cappedSize).toBeLessThanOrEqual(4096);
    });

    it('passes through a small array', () => {
      const input = ['a', 'b', 'c'];
      const result = capToolOutput(input, { maxBytes: 1024 });

      expect(result.truncated).toBe(false);
      expect(result.result).toEqual(['a', 'b', 'c']);
    });
  });

  // ──────────────────── Edge cases ────────────────────

  describe('edge cases', () => {
    it('passes through null', () => {
      const result = capToolOutput(null, { maxBytes: 1024 });

      expect(result.truncated).toBe(false);
      expect(result.result).toBeNull();
    });

    it('passes through undefined', () => {
      const result = capToolOutput(undefined, { maxBytes: 1024 });

      expect(result.truncated).toBe(false);
      expect(result.result).toBeUndefined();
    });

    it('passes through a number', () => {
      const result = capToolOutput(42, { maxBytes: 1024 });

      expect(result.truncated).toBe(false);
      expect(result.result).toBe(42);
    });

    it('handles object with only non-truncatable properties over maxBytes', () => {
      const input: Record<string, number> = {};
      for (let i = 0; i < 10_000; i++) {
        input[`key_${i}`] = i;
      }
      const result = capToolOutput(input, { maxBytes: 1024 });

      // Object has no arrays or strings to truncate, but is still over limit.
      // It gets marked truncated but cannot actually be reduced further.
      expect(result.truncated).toBe(true);
      expect(result.originalSize).toBeGreaterThan(1024);
    });

    it('reports correct metadata for string truncation', () => {
      const input = makeString(10_000);
      const result = capToolOutput(input, { maxBytes: 512 });

      expect(result.truncated).toBe(true);
      expect(result.originalSize).toBe(jsonByteSize(input));
      expect(result.cappedSize).toBe(jsonByteSize(result.result));
      expect(result.cappedSize).toBeLessThanOrEqual(512);
      expect(result.itemsRemoved).toBe(0);
    });

    it('reports correct metadata for array truncation', () => {
      const input = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const result = capToolOutput(input, { maxItems: 5 });

      expect(result.truncated).toBe(true);
      expect(result.originalSize).toBe(jsonByteSize(input));
      expect(result.cappedSize).toBe(jsonByteSize(result.result));
      expect(result.itemsRemoved).toBe(95);
    });

    it('handles a very small maxBytes for strings', () => {
      const input = makeString(10_000);
      const result = capToolOutput(input, { maxBytes: 32 });

      expect(result.truncated).toBe(true);
      expect(jsonByteSize(result.result)).toBeLessThanOrEqual(32);
    });

    it('handles boolean input', () => {
      const result = capToolOutput(true, { maxBytes: 1024 });

      expect(result.truncated).toBe(false);
      expect(result.result).toBe(true);
    });
  });
});
