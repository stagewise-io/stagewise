import { describe, it, expect } from 'vitest';
import { computeSandboxChanges } from './sandbox-changes';

describe('computeSandboxChanges', () => {
  it('returns empty array when previous session ID is null', () => {
    expect(computeSandboxChanges(null, 'abc-123')).toEqual([]);
  });

  it('returns empty array when current session ID is null', () => {
    expect(computeSandboxChanges('abc-123', null)).toEqual([]);
  });

  it('returns empty array when both are null', () => {
    expect(computeSandboxChanges(null, null)).toEqual([]);
  });

  it('returns empty array when session ID is unchanged', () => {
    expect(computeSandboxChanges('abc-123', 'abc-123')).toEqual([]);
  });

  it('returns sandbox-restarted entry when session ID changed', () => {
    const result = computeSandboxChanges('abc-123', 'def-456');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('sandbox-restarted');
    expect(result[0].summary).toBeUndefined();
  });
});
