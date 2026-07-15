import { describe, expect, it, vi } from 'vitest';
import { mapWithBoundedConcurrency } from './bounded-concurrency';

describe('mapWithBoundedConcurrency', () => {
  it('preserves input order and limits active mappers', async () => {
    let active = 0;
    let maximum = 0;
    const result = await mapWithBoundedConcurrency(
      [1, 2, 3, 4],
      2,
      async (value) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return value * 2;
      },
      { fallback: () => -1 },
    );

    expect(result).toEqual([2, 4, 6, 8]);
    expect(maximum).toBe(2);
  });

  it('does not schedule work after cancellation', async () => {
    const controller = new AbortController();
    const mapper = vi.fn(async (value: number) => {
      controller.abort();
      return value;
    });

    const result = await mapWithBoundedConcurrency([1, 2, 3], 1, mapper, {
      signal: controller.signal,
      fallback: () => -1,
    });

    expect(mapper).toHaveBeenCalledTimes(1);
    expect(result).toEqual([1, -1, -1]);
  });

  it('uses fallback values for mapper failures', async () => {
    const result = await mapWithBoundedConcurrency(
      [1, 2],
      2,
      async (value) => {
        if (value === 2) throw new Error('failed');
        return value;
      },
      { fallback: () => 0 },
    );

    expect(result).toEqual([1, 0]);
  });
});
