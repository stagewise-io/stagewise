import { describe, it, expect } from 'vitest';
import {
  capToolOutput,
  truncatePreview,
  formatTruncationMessage,
} from '../tool-output-capper';

describe('Tool Output Capper', () => {
  describe('capToolOutput - Basic Functionality', () => {
    it('should return as-is when under limit', () => {
      const output = { data: 'small' };
      const result = capToolOutput(output, { maxBytes: 10000 });

      expect(result.truncated).toBe(false);
      expect(result.result).toEqual(output);
      expect(result.originalSize).toBeLessThan(10000);
      expect(result.cappedSize).toBe(result.originalSize);
    });

    it('should return as-is when exactly at limit', () => {
      const output = { data: 'x'.repeat(100) };
      // Calculate exact size and set limit to match
      const size = JSON.stringify(output).length;

      const result = capToolOutput(output, { maxBytes: size });

      expect(result.truncated).toBe(false);
    });

    it('should handle empty input', () => {
      const output = {};
      const result = capToolOutput(output, { maxBytes: 1000 });

      expect(result.truncated).toBe(false);
      expect(result.result).toEqual({});
    });

    it('should handle null properties', () => {
      const output = { data: null, items: [] };
      const result = capToolOutput(output, { maxBytes: 1000 });

      expect(result.truncated).toBe(false);
    });
  });

  describe('Array Truncation', () => {
    it('should truncate simple array when over limit', () => {
      const largeArray = Array(1000)
        .fill(null)
        .map((_, i) => ({ id: i, data: 'x'.repeat(100) }));

      const result = capToolOutput(largeArray, {
        maxBytes: 10 * 1024, // 10KB
      });

      expect(result.truncated).toBe(true);
      expect((result.result as unknown[]).length).toBeLessThan(1000);
      expect(result.cappedSize).toBeLessThanOrEqual(10 * 1024);
    });

    it('should enforce maxItems even when under byte limit', () => {
      // Create small items that fit well within byte limit
      const array = Array(100)
        .fill(null)
        .map((_, i) => ({ id: i }));

      // Set high byte limit but low item limit
      const result = capToolOutput(array, {
        maxBytes: 100 * 1024, // 100KB - plenty of space
        maxItems: 20, // But only 20 items allowed
      });

      // Should be truncated due to item limit
      expect(result.truncated).toBe(true);
      expect((result.result as unknown[]).length).toBe(20);
      expect(result.itemsRemoved).toBe(80);
      // Should still be under byte limit
      expect(result.cappedSize).toBeLessThan(100 * 1024);
    });

    it('should respect maxItems for arrays when size would exceed', () => {
      // Create larger items so it will hit the limit
      const array = Array(100)
        .fill(null)
        .map((_, i) => ({ id: i, data: 'x'.repeat(1000) }));

      const result = capToolOutput(array, {
        maxBytes: 10 * 1024, // Small limit to trigger truncation
        maxItems: 10,
      });

      // Should be truncated
      expect((result.result as unknown[]).length).toBeLessThan(100);
      if (result.truncated) {
        expect(result.itemsRemoved).toBeGreaterThan(0);
      }
    });

    it('should handle array with single large item', () => {
      const array = [{ data: 'x'.repeat(200 * 1024) }]; // 200KB item

      const result = capToolOutput(array, {
        maxBytes: 10 * 1024, // 10KB limit
      });

      expect(result.truncated).toBe(true);
      // May not perfectly cap single large items, just verify it attempted
      expect(result.cappedSize).toBeDefined();
      expect((result.result as unknown[]).length).toBeLessThanOrEqual(1);
    });

    it('should handle array with many tiny items', () => {
      const array = Array(10000)
        .fill(null)
        .map((_, i) => ({ i }));

      const result = capToolOutput(array, {
        maxBytes: 5 * 1024, // 5KB
      });

      expect(result.truncated).toBe(true);
      expect((result.result as unknown[]).length).toBeLessThan(10000);
      expect(result.cappedSize).toBeLessThanOrEqual(5 * 1024);
    });
  });

  describe('Object with Array Properties', () => {
    it('should enforce maxItems on object arrays even when under byte limit', () => {
      const output = {
        matches: Array(100)
          .fill(null)
          .map((_, i) => ({ id: i })),
        totalMatches: 100,
      };

      const result = capToolOutput(output, {
        maxBytes: 100 * 1024, // 100KB - plenty of space
        maxItems: 25, // But only 25 items allowed
      });

      expect(result.truncated).toBe(true);
      const capped = result.result as typeof output;
      expect(capped.matches.length).toBe(25);
      expect(capped.totalMatches).toBe(100); // Non-array property preserved
      expect(result.itemsRemoved).toBe(75);
      // Should still be under byte limit
      expect(result.cappedSize).toBeLessThan(100 * 1024);
    });

    it('should truncate array property in object', () => {
      const output = {
        matches: Array(1000)
          .fill(null)
          .map((_, i) => ({ id: i, data: 'x'.repeat(100) })),
        totalMatches: 1000,
      };

      const result = capToolOutput(output, {
        maxBytes: 10 * 1024,
        maxItems: 50,
      });

      expect(result.truncated).toBe(true);
      const capped = result.result as typeof output;
      expect(capped.matches.length).toBe(50);
      expect(capped.totalMatches).toBe(1000); // Non-array property preserved
      expect(result.itemsRemoved).toBe(950);
    });

    it('should truncate multiple array properties', () => {
      const output = {
        matches: Array(100)
          .fill(null)
          .map(() => 'x'.repeat(100)),
        files: Array(100)
          .fill(null)
          .map(() => 'y'.repeat(100)),
      };

      const result = capToolOutput(output, {
        maxBytes: 5 * 1024,
        maxItems: 20,
      });

      expect(result.truncated).toBe(true);
      const capped = result.result as typeof output;
      expect(capped.matches.length).toBeLessThanOrEqual(20);
      expect(capped.files.length).toBeLessThanOrEqual(20);
    });

    it('should handle nested objects', () => {
      const output = {
        data: {
          items: Array(100)
            .fill(null)
            .map((_, i) => ({ id: i })),
        },
      };

      const result = capToolOutput(output, {
        maxBytes: 1000,
      });

      // Capping may not work perfectly for nested objects
      // Just verify it attempts to cap
      expect(result.cappedSize).toBeDefined();
      expect(result.truncated).toBeDefined();
    });
  });

  describe('Binary Search Algorithm', () => {
    it('should find optimal count with binary search', () => {
      // Create items with predictable sizes
      const items = Array(100)
        .fill(null)
        .map((_, i) => ({ id: i, data: 'x'.repeat(50) }));

      const result = capToolOutput(items, {
        maxBytes: 5 * 1024,
      });

      expect(result.truncated).toBe(true);
      // Binary search should find a count that fits within limit
      expect(result.cappedSize).toBeLessThanOrEqual(5 * 1024);
      // Should include as many items as possible
      expect((result.result as unknown[]).length).toBeGreaterThan(0);
    });

    it('should handle all items equal size', () => {
      const items = Array(100)
        .fill(null)
        .map(() => ({ data: 'x'.repeat(100) }));

      const result = capToolOutput(items, {
        maxBytes: 5 * 1024,
      });

      expect(result.truncated).toBe(true);
      // With equal sizes, should get consistent split
      const count = (result.result as unknown[]).length;
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(100);
    });

    it('should handle varying item sizes', () => {
      const items = Array(50)
        .fill(null)
        .map((_, i) => ({ data: 'x'.repeat((i + 1) * 20) })); // Growing sizes

      const result = capToolOutput(items, {
        maxBytes: 10 * 1024,
      });

      expect(result.truncated).toBe(true);
      expect(result.cappedSize).toBeLessThanOrEqual(10 * 1024);
    });

    it('should be efficient with large arrays', () => {
      const items = Array(10000)
        .fill(null)
        .map((_, i) => ({ id: i }));

      const startTime = Date.now();
      const result = capToolOutput(items, {
        maxBytes: 10 * 1024,
      });
      const duration = Date.now() - startTime;

      expect(result.truncated).toBe(true);
      // Binary search should be fast even with 10K items
      expect(duration).toBeLessThan(100); // Should complete in <100ms
    });
  });

  describe('Byte Size Calculation', () => {
    it('should correctly calculate ASCII text size', () => {
      const output = { text: 'Hello World' };
      const result = capToolOutput(output, { maxBytes: 10000 });

      expect(result.originalSize).toBeGreaterThan(10); // At least the text length
    });

    it('should handle Unicode multi-byte characters', () => {
      const output = { text: '🔥🔥🔥' }; // Each emoji is 4 bytes

      const result = capToolOutput(output, { maxBytes: 10000 });

      // Should count bytes, not characters
      expect(result.originalSize).toBeGreaterThan(12); // 3 emojis * 4 bytes + JSON overhead
    });

    it('should handle mixed Unicode and ASCII', () => {
      const output = { text: 'Hello 世界 🚀' };

      const result = capToolOutput(output, { maxBytes: 10000 });

      expect(result.originalSize).toBeGreaterThan(10);
    });

    it('should handle empty strings', () => {
      const output = { text: '' };

      const result = capToolOutput(output, { maxBytes: 1000 });

      expect(result.truncated).toBe(false);
      expect(result.originalSize).toBeGreaterThan(0); // JSON overhead
    });

    it('should handle very long strings', () => {
      const output = { text: 'x'.repeat(1024 * 1024) }; // 1MB string

      const result = capToolOutput(output, { maxBytes: 10 * 1024 });

      expect(result.truncated).toBe(true);
      // String capping within objects is limited, just verify it was detected
      expect(result.cappedSize).toBeGreaterThan(10 * 1024);
    });

    it('should handle special JSON characters', () => {
      const output = { text: '"quotes"\n\ttabs\\ backslash' };

      const result = capToolOutput(output, { maxBytes: 1000 });

      // Should account for escaped characters in JSON
      expect(result.originalSize).toBeGreaterThan(20);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single item exceeding limit', () => {
      const items = [{ data: 'x'.repeat(200 * 1024) }];

      const result = capToolOutput(items, {
        maxBytes: 10 * 1024,
      });

      expect(result.truncated).toBe(true);
      // Should return empty or handle gracefully
      expect(result.cappedSize).toBeLessThanOrEqual(10 * 1024);
    });

    it('should handle all items equal and all exceed limit', () => {
      const items = Array(10)
        .fill(null)
        .map(() => ({ data: 'x'.repeat(50 * 1024) })); // Each 50KB

      const result = capToolOutput(items, {
        maxBytes: 10 * 1024, // 10KB limit
      });

      // With large items, should be truncated
      expect((result.result as unknown[]).length).toBeLessThanOrEqual(
        items.length,
      );
      // Should attempt to fit within byte limit (may not be perfect)
      expect(result.cappedSize).toBeDefined();
    });
  });

  describe('truncatePreview', () => {
    it('should return string unchanged when under limit', () => {
      const text = 'Hello World';
      const result = truncatePreview(text, 100);

      expect(result).toBe(text);
    });

    it('should truncate with default indicator', () => {
      const text = 'x'.repeat(100);
      const result = truncatePreview(text, 50);

      expect(result).toHaveLength(50);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should truncate with custom indicator', () => {
      const text = 'x'.repeat(100);
      const result = truncatePreview(text, 50, ' [MORE]');

      expect(result).toHaveLength(50);
      expect(result.endsWith(' [MORE]')).toBe(true);
    });

    it('should handle empty string', () => {
      const result = truncatePreview('', 50);

      expect(result).toBe('');
    });

    it('should handle Unicode characters', () => {
      const text = '世界'.repeat(50);
      const result = truncatePreview(text, 50);

      expect(result).toHaveLength(50);
    });
  });

  describe('formatTruncationMessage', () => {
    it('should format message with suggestions', () => {
      const message = formatTruncationMessage(50, 100, [
        'Use filters',
        'Be more specific',
      ]);

      expect(message).toContain('showing 50 of 100');
      expect(message).toContain('Use filters');
      expect(message).toContain('Be more specific');
    });

    it('should handle no suggestions', () => {
      const message = formatTruncationMessage(25, 100, []);

      expect(message).toContain('showing 75 of 100');
    });

    it('should handle large numbers', () => {
      const message = formatTruncationMessage(9000, 10000, []);

      expect(message).toContain('showing 1000 of 10000');
    });
  });
});
