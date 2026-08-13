import { describe, expect, it } from 'vitest';
import { formatCodexUsageWindow } from './usage';

describe('formatCodexUsageWindow', () => {
  it('ignores windows without a duration', () => {
    expect(
      formatCodexUsageWindow({
        usedPercent: 10,
        windowDurationMins: null,
      }),
    ).toBeNull();
  });
});
