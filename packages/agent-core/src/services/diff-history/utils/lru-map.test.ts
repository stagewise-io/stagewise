import { describe, it, expect } from 'vitest';
import { LRUMap } from './lru-map';

describe('LRUMap', () => {
  it('preserves entries within capacity', () => {
    const map = new LRUMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);
    expect(map.size).toBe(3);
    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBe(2);
    expect(map.get('c')).toBe(3);
  });

  it('evicts the oldest entry when capacity is exceeded', () => {
    const map = new LRUMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3); // evicts 'a'
    expect(map.size).toBe(2);
    expect(map.has('a')).toBe(false);
    expect(map.get('b')).toBe(2);
    expect(map.get('c')).toBe(3);
  });

  it('get() promotes entry to most-recent (prevents premature eviction)', () => {
    const map = new LRUMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);

    // Access 'a' to promote it — now 'b' is the oldest.
    map.get('a');

    map.set('c', 3); // evicts 'b', not 'a'
    expect(map.has('a')).toBe(true);
    expect(map.has('b')).toBe(false);
    expect(map.has('c')).toBe(true);
  });

  it('has() does NOT promote (read-only check)', () => {
    const map = new LRUMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);

    // has('a') should NOT promote — 'a' remains the oldest.
    map.has('a');

    map.set('c', 3); // evicts 'a'
    expect(map.has('a')).toBe(false);
    expect(map.has('b')).toBe(true);
    expect(map.has('c')).toBe(true);
  });

  it('updates value in-place without evicting', () => {
    const map = new LRUMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.set('a', 10); // update, not a new entry
    expect(map.size).toBe(2);
    expect(map.get('a')).toBe(10);
    expect(map.get('b')).toBe(2);
  });

  it('set() on existing key promotes it to most-recent', () => {
    const map = new LRUMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.set('a', 10); // promotes 'a', 'b' is now oldest

    map.set('c', 3); // evicts 'b'
    expect(map.has('a')).toBe(true);
    expect(map.has('b')).toBe(false);
    expect(map.has('c')).toBe(true);
  });

  it('works correctly with maxSize of 1', () => {
    const map = new LRUMap<string, number>(1);
    map.set('a', 1);
    expect(map.get('a')).toBe(1);
    map.set('b', 2); // evicts 'a'
    expect(map.size).toBe(1);
    expect(map.has('a')).toBe(false);
    expect(map.get('b')).toBe(2);
  });

  it('get() returns undefined for missing keys without side effects', () => {
    const map = new LRUMap<string, number>(2);
    map.set('a', 1);
    expect(map.get('missing')).toBeUndefined();
    expect(map.size).toBe(1);
  });
});
