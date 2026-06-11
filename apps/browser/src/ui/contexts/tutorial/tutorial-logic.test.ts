import { describe, expect, it } from 'vitest';
import {
  getLastSeenStepIndex,
  getTutorialStartIndex,
  getTutorialStorageKey,
  insertQueuedTutorial,
  isTutorialCompleted,
  takeNextEligibleTutorial,
} from './tutorial-logic';
import type { TutorialDefinition } from './types';

const step = (n: number) => ({
  targetSelector: `[data-tutorial="step-${n}"]`,
  title: `Step ${n}`,
  description: `Description ${n}`,
});

const makeTutorial = (
  id: string,
  stepCount: number,
  overrides?: Partial<TutorialDefinition>,
): TutorialDefinition => ({
  id,
  version: 1,
  steps: Array.from({ length: stepCount }, (_, i) => step(i)),
  ...overrides,
});

describe('getTutorialStorageKey', () => {
  it('uses the plain id for version 1 (backwards compatible)', () => {
    expect(getTutorialStorageKey({ id: 'file-tree', version: 1 })).toBe(
      'file-tree',
    );
  });

  it('namespaces the key for later versions', () => {
    expect(getTutorialStorageKey({ id: 'file-tree', version: 2 })).toBe(
      'file-tree@v2',
    );
  });
});

describe('isTutorialCompleted', () => {
  it('is false when no progress is persisted', () => {
    expect(isTutorialCompleted(makeTutorial('a', 3), {})).toBe(false);
  });

  it('is false when only some steps were seen', () => {
    expect(isTutorialCompleted(makeTutorial('a', 3), { a: 1 })).toBe(false);
  });

  it('is true when the last step was seen', () => {
    expect(isTutorialCompleted(makeTutorial('a', 3), { a: 2 })).toBe(true);
  });

  it('discards stale progress after a version bump', () => {
    const v2 = makeTutorial('a', 3, { version: 2 });
    // Progress persisted under the v1 key must not complete the v2 tutorial.
    expect(isTutorialCompleted(v2, { a: 2 })).toBe(false);
    expect(isTutorialCompleted(v2, { 'a@v2': 2 })).toBe(true);
  });
});

describe('getTutorialStartIndex', () => {
  const tutorial = makeTutorial('a', 4);

  it('starts at 0 without persisted progress', () => {
    expect(getTutorialStartIndex(tutorial, {})).toBe(0);
  });

  it('resumes at the first unseen step', () => {
    expect(getTutorialStartIndex(tutorial, { a: 1 })).toBe(2);
  });

  it('prefers the preserved hidden index over persisted progress', () => {
    expect(getTutorialStartIndex(tutorial, { a: 1 }, 0)).toBe(0);
  });

  it('clamps to the last step when progress exceeds bounds', () => {
    expect(getTutorialStartIndex(tutorial, { a: 99 })).toBe(3);
  });

  it('never returns a negative index', () => {
    expect(getTutorialStartIndex(tutorial, { a: -5 })).toBe(0);
  });
});

describe('getLastSeenStepIndex', () => {
  it('returns -1 when never shown', () => {
    expect(getLastSeenStepIndex({ id: 'a', version: 1 }, {})).toBe(-1);
  });

  it('reads from the versioned key', () => {
    expect(
      getLastSeenStepIndex({ id: 'a', version: 2 }, { a: 5, 'a@v2': 1 }),
    ).toBe(1);
  });
});

describe('insertQueuedTutorial', () => {
  const high = makeTutorial('high', 1, { priority: 0 });
  const mid = makeTutorial('mid', 1, { priority: 1 });
  const low = makeTutorial('low', 1, { priority: 2 });

  it('keeps the queue sorted by priority regardless of insertion order', () => {
    let queue = insertQueuedTutorial([], low);
    queue = insertQueuedTutorial(queue, high);
    queue = insertQueuedTutorial(queue, mid);
    expect(queue.map((d) => d.id)).toEqual(['high', 'mid', 'low']);
  });

  it('deduplicates by id', () => {
    let queue = insertQueuedTutorial([], high);
    queue = insertQueuedTutorial(queue, makeTutorial('high', 1));
    expect(queue).toHaveLength(1);
  });

  it('sorts tutorials without a priority last', () => {
    let queue = insertQueuedTutorial([], makeTutorial('unprioritized', 1));
    queue = insertQueuedTutorial(queue, low);
    expect(queue.map((d) => d.id)).toEqual(['low', 'unprioritized']);
  });

  it('does not mutate the input queue', () => {
    const original = [high];
    const next = insertQueuedTutorial(original, low);
    expect(original).toHaveLength(1);
    expect(next).toHaveLength(2);
  });
});

describe('takeNextEligibleTutorial', () => {
  const a = makeTutorial('a', 2, { priority: 0 });
  const b = makeTutorial('b', 2, { priority: 1 });
  const c = makeTutorial('c', 2, { priority: 2 });

  it('returns the first eligible tutorial and the remaining queue', () => {
    const { next, remaining } = takeNextEligibleTutorial(
      [a, b, c],
      {},
      new Set(),
    );
    expect(next?.id).toBe('a');
    expect(remaining.map((d) => d.id)).toEqual(['b', 'c']);
  });

  it('skips tutorials dismissed in this session', () => {
    const { next } = takeNextEligibleTutorial([a, b], {}, new Set(['a']));
    expect(next?.id).toBe('b');
  });

  it('skips completed tutorials', () => {
    const { next } = takeNextEligibleTutorial([a, b], { a: 1 }, new Set());
    expect(next?.id).toBe('b');
  });

  it('returns null when nothing is eligible', () => {
    const { next, remaining } = takeNextEligibleTutorial(
      [a, b],
      { a: 1 },
      new Set(['b']),
    );
    expect(next).toBeNull();
    expect(remaining).toHaveLength(0);
  });
});
