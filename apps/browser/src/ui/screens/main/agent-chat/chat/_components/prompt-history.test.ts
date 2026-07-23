import { describe, expect, it } from 'vitest';
import {
  getPromptHistoryStep,
  type PromptHistoryDirection,
} from './prompt-history';

function step(
  direction: PromptHistoryDirection,
  cursor: number | null,
  options: { entryCount?: number; canStart?: boolean } = {},
) {
  return getPromptHistoryStep({
    direction,
    cursor,
    entryCount: options.entryCount ?? 3,
    canStart: options.canStart ?? false,
  });
}

describe('getPromptHistoryStep', () => {
  it('starts at the latest prompt only when the input is empty', () => {
    expect(step('older', null, { canStart: true })).toEqual({
      handled: true,
      cursor: 2,
    });
    expect(step('older', null)).toEqual({ handled: false });
  });

  it('cycles backward and stops at the oldest prompt', () => {
    expect(step('older', 2)).toEqual({ handled: true, cursor: 1 });
    expect(step('older', 0)).toEqual({ handled: true, cursor: 0 });
  });

  it('cycles forward and leaves history after the latest prompt', () => {
    expect(step('newer', 0)).toEqual({ handled: true, cursor: 1 });
    expect(step('newer', 2)).toEqual({ handled: true, cursor: null });
  });

  it('does not consume keys when navigation cannot start', () => {
    expect(step('newer', null, { canStart: true })).toEqual({
      handled: false,
    });
    expect(step('older', null, { entryCount: 0, canStart: true })).toEqual({
      handled: false,
    });
  });
});
