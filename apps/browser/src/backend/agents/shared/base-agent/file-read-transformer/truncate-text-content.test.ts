/**
 * Unit tests for `truncateTextContent()` — the shared helper that
 * handles line-range slicing and full-content truncation for all
 * text-based transformers.
 *
 * These are pure-function tests (no filesystem, no cache, no pipeline).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  truncateTextContent,
  setMaxReadChars,
  getMaxReadChars,
} from './format-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Width of each generated line (excluding the newline). */
const LINE_WIDTH = 30;

/** Generate N lines, each exactly LINE_WIDTH chars. */
function generateLines(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const prefix = `line ${String(i + 1).padStart(4, '0')} `;
    return prefix + '.'.repeat(LINE_WIDTH - prefix.length);
  });
}

/** Char budget that fits exactly `n` of the generated lines. */
function budgetForLines(n: number): number {
  return n * (LINE_WIDTH + 1);
}

/** Count how many line-numbered content lines appear in output. */
function countNumberedLines(output: string): number {
  return output.split('\n').filter((l) => /^\d+\|/.test(l)).length;
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

let savedBudget: number;

beforeEach(() => {
  savedBudget = getMaxReadChars();
});

afterEach(() => {
  setMaxReadChars(savedBudget);
});

// ---------------------------------------------------------------------------
// Full content — no line range specified
// ---------------------------------------------------------------------------

describe('truncateTextContent – full content', () => {
  it('returns all lines when content fits within budget', () => {
    setMaxReadChars(budgetForLines(50));
    const lines = generateLines(10);

    const result = truncateTextContent(lines, {});

    expect(countNumberedLines(result.output)).toBe(10);
    expect(result.output).toContain('1|line 0001');
    expect(result.output).toContain('10|line 0010');
    expect(result.output).not.toContain('truncated');
    expect(result.effectiveReadParams).toBeUndefined();
  });

  it('truncates when content exceeds budget', () => {
    setMaxReadChars(budgetForLines(5));
    const lines = generateLines(20);

    const result = truncateTextContent(lines, {});

    expect(countNumberedLines(result.output)).toBe(5);
    expect(result.output).toContain('1|line 0001');
    expect(result.output).toContain('5|line 0005');
    expect(result.output).not.toContain('6|line 0006');
    expect(result.output).toContain('truncated');
    expect(result.output).toContain('15 more lines remaining');
    expect(result.effectiveReadParams).toEqual({
      startLine: 1,
      endLine: 5,
    });
  });

  it('exactly-at-budget content is not truncated', () => {
    const lines = generateLines(10);
    setMaxReadChars(budgetForLines(10));

    const result = truncateTextContent(lines, {});

    expect(countNumberedLines(result.output)).toBe(10);
    expect(result.output).not.toContain('truncated');
    expect(result.effectiveReadParams).toBeUndefined();
  });

  it('single line always fits regardless of budget', () => {
    setMaxReadChars(1); // minimal budget
    const lines = ['a very long line that exceeds the budget'];

    const result = truncateTextContent(lines, {});

    // countLinesFittingBudget guarantees at least 1 line
    expect(countNumberedLines(result.output)).toBe(1);
    expect(result.effectiveReadParams).toBeUndefined();
  });

  it('empty file returns empty numbered output', () => {
    const lines = [''];

    const result = truncateTextContent(lines, {});

    expect(result.output).toBe('1|');
    expect(result.effectiveReadParams).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Line-range slicing
// ---------------------------------------------------------------------------

describe('truncateTextContent – line range', () => {
  it('returns requested range when it fits in budget', () => {
    setMaxReadChars(budgetForLines(50));
    const lines = generateLines(100);

    const result = truncateTextContent(lines, {
      startLine: 20,
      endLine: 30,
    });

    expect(countNumberedLines(result.output)).toBe(11); // 20..30 inclusive
    expect(result.output).toContain('20|line 0020');
    expect(result.output).toContain('30|line 0030');
    expect(result.output).not.toContain('truncated');
    expect(result.effectiveReadParams).toEqual({
      startLine: 20,
      endLine: 30,
    });
  });

  it('truncates range at budget boundary', () => {
    setMaxReadChars(budgetForLines(10));
    const lines = generateLines(100);

    const result = truncateTextContent(lines, {
      startLine: 20,
      endLine: 80,
    });

    expect(countNumberedLines(result.output)).toBe(10);
    expect(result.output).toContain('20|line 0020');
    expect(result.output).toContain('29|line 0029');
    expect(result.output).not.toContain('30|line 0030');
    expect(result.output).toContain('truncated');
    expect(result.output).toContain('more lines until line 80');
    expect(result.effectiveReadParams).toEqual({
      startLine: 20,
      endLine: 29,
    });
  });

  it('clamps startLine to 1 when given 0 or negative', () => {
    setMaxReadChars(budgetForLines(50));
    const lines = generateLines(10);

    const result = truncateTextContent(lines, {
      startLine: -5,
      endLine: 5,
    });

    expect(result.output).toContain('1|line 0001');
    expect(result.effectiveReadParams?.startLine).toBe(1);
  });

  it('clamps endLine to totalLines when exceeding file length', () => {
    setMaxReadChars(budgetForLines(50));
    const lines = generateLines(10);

    const result = truncateTextContent(lines, {
      startLine: 5,
      endLine: 999,
    });

    expect(countNumberedLines(result.output)).toBe(6); // 5..10 inclusive
    expect(result.output).toContain('10|line 0010');
    expect(result.effectiveReadParams).toEqual({
      startLine: 5,
      endLine: 10,
    });
  });

  it('only startLine specified — reads to end of file', () => {
    setMaxReadChars(budgetForLines(50));
    const lines = generateLines(10);

    const result = truncateTextContent(lines, { startLine: 8 });

    expect(countNumberedLines(result.output)).toBe(3); // 8, 9, 10
    expect(result.output).toContain('8|line 0008');
    expect(result.output).toContain('10|line 0010');
  });

  it('only endLine specified — reads from line 1', () => {
    setMaxReadChars(budgetForLines(50));
    const lines = generateLines(10);

    const result = truncateTextContent(lines, { endLine: 3 });

    expect(countNumberedLines(result.output)).toBe(3); // 1, 2, 3
    expect(result.output).toContain('1|line 0001');
    expect(result.output).toContain('3|line 0003');
    expect(result.effectiveReadParams).toEqual({
      startLine: 1,
      endLine: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// Budget changes between calls
// ---------------------------------------------------------------------------

describe('truncateTextContent – budget sensitivity', () => {
  it('different budgets produce different truncation points', () => {
    const lines = generateLines(50);

    setMaxReadChars(budgetForLines(5));
    const r1 = truncateTextContent(lines, {});
    expect(r1.effectiveReadParams).toEqual({ startLine: 1, endLine: 5 });

    setMaxReadChars(budgetForLines(20));
    const r2 = truncateTextContent(lines, {});
    expect(r2.effectiveReadParams).toEqual({ startLine: 1, endLine: 20 });

    setMaxReadChars(budgetForLines(100));
    const r3 = truncateTextContent(lines, {});
    expect(r3.effectiveReadParams).toBeUndefined(); // no truncation
  });
});

// ---------------------------------------------------------------------------
// ReadParams passthrough (non-line params are ignored)
// ---------------------------------------------------------------------------

describe('truncateTextContent – ignores non-line ReadParams', () => {
  it('page params do not affect truncation', () => {
    setMaxReadChars(budgetForLines(50));
    const lines = generateLines(10);

    const result = truncateTextContent(lines, {
      startPage: 2,
      endPage: 5,
    });

    // No startLine/endLine → full content path
    expect(countNumberedLines(result.output)).toBe(10);
    expect(result.effectiveReadParams).toBeUndefined();
  });

  it('depth param does not affect truncation', () => {
    setMaxReadChars(budgetForLines(50));
    const lines = generateLines(10);

    const result = truncateTextContent(lines, { depth: 3 });

    expect(countNumberedLines(result.output)).toBe(10);
    expect(result.effectiveReadParams).toBeUndefined();
  });

  it('preview param is not handled (returns full content path)', () => {
    // truncateTextContent does NOT handle preview — that's the caller's
    // responsibility. If preview=true is passed, it falls through to the
    // full-content path because startLine/endLine are both undefined.
    setMaxReadChars(budgetForLines(50));
    const lines = generateLines(10);

    const result = truncateTextContent(lines, { preview: true });

    expect(countNumberedLines(result.output)).toBe(10);
    expect(result.effectiveReadParams).toBeUndefined();
  });
});
