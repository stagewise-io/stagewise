import { describe, expect, it } from 'vitest';
import { formatOpenCodeUsage } from './usage';

describe('formatOpenCodeUsage', () => {
  it('maps OpenCode Go usage windows', () => {
    expect(
      formatOpenCodeUsage({
        usage: {
          rolling: { percent: 12 },
          weekly: { percent: 34 },
          monthly: { percent: 56 },
        },
      }),
    ).toEqual([
      { label: '5h', usedPercent: 12 },
      { label: '1w', usedPercent: 34 },
      { label: '1mo', usedPercent: 56 },
    ]);
  });
});
