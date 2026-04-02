import { describe, it, expect } from 'vitest';
import type { Patch } from 'immer';
import { applyPatchesDirect } from '../../src/shared/apply-patches.js';

describe('applyPatchesDirect', () => {
  it('should return same reference for empty patches', () => {
    const base = { a: 1, b: { c: 2 } };
    const result = applyPatchesDirect(base, []);
    expect(result).toBe(base);
  });

  it('should replace a nested object property', () => {
    const base = { level1: { level2: { value: 10 } } };
    const patches: Patch[] = [
      { op: 'replace', path: ['level1', 'level2', 'value'], value: 42 },
    ];
    const result = applyPatchesDirect(base, patches);

    expect(result.level1.level2.value).toBe(42);
    // Original untouched
    expect(base.level1.level2.value).toBe(10);
  });

  it('should replace at root (empty path)', () => {
    const base = { a: 1 };
    const patches: Patch[] = [
      { op: 'replace', path: [], value: { a: 99 } },
    ];
    const result = applyPatchesDirect(base, patches);

    expect(result).toEqual({ a: 99 });
    expect(base.a).toBe(1);
  });

  it('should add to array at specific index', () => {
    const base = { items: ['a', 'b', 'c'] };
    const patches: Patch[] = [
      { op: 'add', path: ['items', 1], value: 'X' },
    ];
    const result = applyPatchesDirect(base, patches);

    expect(result.items).toEqual(['a', 'X', 'b', 'c']);
    expect(base.items).toEqual(['a', 'b', 'c']);
  });

  it('should add to array with "-" key (append)', () => {
    const base = { items: ['a', 'b'] };
    const patches: Patch[] = [
      { op: 'add', path: ['items', '-'], value: 'c' },
    ];
    const result = applyPatchesDirect(base, patches);

    expect(result.items).toEqual(['a', 'b', 'c']);
  });

  it('should add a new property to an object', () => {
    const base: Record<string, any> = { a: 1 };
    const patches: Patch[] = [
      { op: 'add', path: ['b'], value: 2 },
    ];
    const result = applyPatchesDirect(base, patches);

    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('should remove a property from an object', () => {
    const base = { a: 1, b: 2 };
    const patches: Patch[] = [
      { op: 'remove', path: ['b'] },
    ];
    const result = applyPatchesDirect(base, patches);

    expect(result).toEqual({ a: 1 });
    expect(base).toEqual({ a: 1, b: 2 });
  });

  it('should remove from array at index', () => {
    const base = { items: ['a', 'b', 'c'] };
    const patches: Patch[] = [
      { op: 'remove', path: ['items', 1] },
    ];
    const result = applyPatchesDirect(base, patches);

    expect(result.items).toEqual(['a', 'c']);
    expect(base.items).toEqual(['a', 'b', 'c']);
  });

  it('should apply multiple patches in sequence', () => {
    const base = { counter: 0, users: ['Alice'] };
    const patches: Patch[] = [
      { op: 'replace', path: ['counter'], value: 10 },
      { op: 'add', path: ['users', 1], value: 'Bob' },
      { op: 'replace', path: ['counter'], value: 20 },
    ];
    const result = applyPatchesDirect(base, patches);

    expect(result).toEqual({ counter: 20, users: ['Alice', 'Bob'] });
    expect(base).toEqual({ counter: 0, users: ['Alice'] });
  });

  it('should preserve structural sharing for unchanged siblings', () => {
    const child1 = { value: 1 };
    const child2 = { value: 2 };
    const child3 = { value: 3 };
    const base = { children: [child1, child2, child3] };

    // Only modify children[1]
    const patches: Patch[] = [
      { op: 'replace', path: ['children', 1, 'value'], value: 99 },
    ];
    const result = applyPatchesDirect(base, patches);

    // Modified child is different
    expect(result.children[1].value).toBe(99);
    expect(result.children[1]).not.toBe(child2);

    // Unchanged siblings share references
    expect(result.children[0]).toBe(child1);
    expect(result.children[2]).toBe(child3);

    // Root and array are new references
    expect(result).not.toBe(base);
    expect(result.children).not.toBe(base.children);
  });

  it('should handle deeply nested patch paths', () => {
    const base = {
      a: { b: { c: { d: { e: 'original' } } } },
      sibling: 'untouched',
    };
    const patches: Patch[] = [
      { op: 'replace', path: ['a', 'b', 'c', 'd', 'e'], value: 'updated' },
    ];
    const result = applyPatchesDirect(base, patches);

    expect(result.a.b.c.d.e).toBe('updated');
    expect(base.a.b.c.d.e).toBe('original');
    // Sibling shares reference
    expect(result.sibling).toBe(base.sibling);
  });

  it('should handle array remove then replace (Immer splice pattern)', () => {
    const base = { users: ['Alice', 'Bob', 'Charlie'] };
    const patches: Patch[] = [
      { op: 'remove', path: ['users', 1] },
      { op: 'replace', path: ['users', 1], value: 'David' },
    ];
    const result = applyPatchesDirect(base, patches);

    expect(result.users).toEqual(['Alice', 'David']);
  });
});
