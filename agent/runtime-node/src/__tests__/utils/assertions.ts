import { expect } from 'vitest';
import type { GrepMatch, GrepResult } from '@stagewise/agent-runtime-interface';

/**
 * Asserts that a grep result is successful
 */
export function expectGrepSuccess(
  result: GrepResult,
): asserts result is GrepResult & { success: true } {
  expect(result.success).toBe(true);
  expect(result.error).toBeUndefined();
}

/**
 * Asserts that a grep result has failed
 */
export function expectGrepFailure(result: GrepResult): void {
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
}

/**
 * Asserts that a grep result contains a specific number of matches
 */
export function expectGrepMatchCount(result: GrepResult, count: number): void {
  expectGrepSuccess(result);
  expect(result.matches).toHaveLength(count);
  expect(result.totalMatches).toBe(count);
}

/**
 * Asserts that a grep match has the expected properties
 */
export function expectGrepMatch(
  match: GrepMatch,
  expected: {
    relativePath?: string;
    line?: number;
    column?: number;
    match?: string;
    preview?: string | RegExp;
  },
): void {
  if (expected.relativePath !== undefined) {
    expect(match.relativePath).toBe(expected.relativePath);
  }
  if (expected.line !== undefined) {
    expect(match.line).toBe(expected.line);
  }
  if (expected.column !== undefined) {
    expect(match.column).toBe(expected.column);
  }
  if (expected.match !== undefined) {
    expect(match.match).toBe(expected.match);
  }
  if (expected.preview !== undefined) {
    if (typeof expected.preview === 'string') {
      expect(match.preview).toContain(expected.preview);
    } else {
      expect(match.preview).toMatch(expected.preview);
    }
  }
}

/**
 * Asserts that a grep result contains a match in a specific file
 */
export function expectGrepMatchInFile(
  result: GrepResult,
  relativePath: string,
): void {
  expectGrepSuccess(result);
  const matchInFile = result.matches?.some(
    (m) => m.relativePath === relativePath,
  );
  expect(matchInFile).toBe(true);
}

/**
 * Asserts that a grep result does NOT contain a match in a specific file
 */
export function expectNoGrepMatchInFile(
  result: GrepResult,
  relativePath: string,
): void {
  expectGrepSuccess(result);
  const matchInFile = result.matches?.some(
    (m) => m.relativePath === relativePath,
  );
  expect(matchInFile).toBe(false);
}

/**
 * Asserts that all grep matches are in the allowed files
 */
export function expectOnlyMatchesInFiles(
  result: GrepResult,
  allowedFiles: string[],
): void {
  expectGrepSuccess(result);
  for (const match of result.matches || []) {
    expect(allowedFiles).toContain(match.relativePath);
  }
}

/**
 * Asserts that file content matches the expected content
 */
export function expectFileContent(
  actualContent: string,
  expectedContent: string,
): void {
  expect(actualContent).toBe(expectedContent);
}

/**
 * Asserts that file content contains the expected substring
 */
export function expectFileContains(
  actualContent: string,
  expectedSubstring: string,
): void {
  expect(actualContent).toContain(expectedSubstring);
}

/**
 * Asserts that file content matches a regex
 */
export function expectFileMatches(
  actualContent: string,
  pattern: RegExp,
): void {
  expect(actualContent).toMatch(pattern);
}
