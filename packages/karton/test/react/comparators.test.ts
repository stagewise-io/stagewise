import { describe, it, expect } from 'vitest';
import { shallow, deep } from '../../src/react/comparators.js';

describe('shallow comparison', () => {
  it('should return true for identical primitives', () => {
    expect(shallow(1, 1)).toBe(true);
    expect(shallow('test', 'test')).toBe(true);
    expect(shallow(true, true)).toBe(true);
    expect(shallow(null, null)).toBe(true);
    expect(shallow(undefined, undefined)).toBe(true);
  });

  it('should return false for different primitives', () => {
    expect(shallow(1, 2)).toBe(false);
    expect(shallow('test', 'other')).toBe(false);
    expect(shallow(true, false)).toBe(false);
    expect(shallow(null, undefined)).toBe(false);
  });

  it('should return true for same object reference', () => {
    const obj = { a: 1, b: 2 };
    expect(shallow(obj, obj)).toBe(true);
  });

  it('should use Object.is for NaN comparison', () => {
    expect(shallow(NaN, NaN)).toBe(true);
    expect(shallow(0, -0)).toBe(false);
  });

  it('should compare object properties shallowly', () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { a: 1, b: 2, c: 3 };
    expect(shallow(obj1, obj2)).toBe(true);

    const obj3 = { a: 1, b: 2, c: 4 };
    expect(shallow(obj1, obj3)).toBe(false);

    const obj4 = { a: 1, b: 2 };
    expect(shallow(obj1, obj4)).toBe(false);
  });

  it('should not deep compare nested objects', () => {
    const nested1 = { inner: { value: 1 } };
    const nested2 = { inner: { value: 1 } };
    expect(shallow(nested1, nested2)).toBe(false);

    const sharedInner = { value: 1 };
    const nested3 = { inner: sharedInner };
    const nested4 = { inner: sharedInner };
    expect(shallow(nested3, nested4)).toBe(true);
  });

  it('should compare arrays shallowly', () => {
    const arr1 = [1, 2, 3];
    const arr2 = [1, 2, 3];
    expect(shallow(arr1, arr2)).toBe(true);

    const arr3 = [1, 2, 4];
    expect(shallow(arr1, arr3)).toBe(false);

    const arr4 = [1, 2];
    expect(shallow(arr1, arr4)).toBe(false);
  });

  it('should handle Maps correctly', () => {
    const map1 = new Map([['a', 1], ['b', 2]]);
    const map2 = new Map([['a', 1], ['b', 2]]);
    expect(shallow(map1, map2)).toBe(true);

    const map3 = new Map([['a', 1], ['b', 3]]);
    expect(shallow(map1, map3)).toBe(false);

    const map4 = new Map([['a', 1]]);
    expect(shallow(map1, map4)).toBe(false);
  });

  it('should handle Sets correctly', () => {
    const set1 = new Set([1, 2, 3]);
    const set2 = new Set([1, 2, 3]);
    expect(shallow(set1, set2)).toBe(true);

    const set3 = new Set([1, 2, 4]);
    expect(shallow(set1, set3)).toBe(false);

    const set4 = new Set([1, 2]);
    expect(shallow(set1, set4)).toBe(false);

    const set5 = new Set([3, 2, 1]);
    expect(shallow(set1, set5)).toBe(true);
  });

  it('should compare prototypes', () => {
    class CustomClass {
      value: number;
      constructor(value: number) {
        this.value = value;
      }
    }

    const instance1 = new CustomClass(1);
    const instance2 = new CustomClass(1);
    expect(shallow(instance1, instance2)).toBe(true);

    const plainObj = { value: 1 };
    expect(shallow(instance1, plainObj)).toBe(false);
  });

  it('should handle circular references without infinite loop', () => {
    const obj1: any = { a: 1 };
    obj1.self = obj1;
    const obj2: any = { a: 1 };
    obj2.self = obj2;
    expect(shallow(obj1, obj2)).toBe(false);

    const obj3: any = { a: 1 };
    const obj4: any = { a: 1 };
    obj3.self = obj3;
    obj4.self = obj3;
    expect(shallow(obj3, obj4)).toBe(true);
  });
});

describe('deep comparison', () => {
  it('should return true for identical primitives', () => {
    expect(deep(1, 1)).toBe(true);
    expect(deep('test', 'test')).toBe(true);
    expect(deep(true, true)).toBe(true);
    expect(deep(null, null)).toBe(true);
    expect(deep(undefined, undefined)).toBe(true);
  });

  it('should return false for different primitives', () => {
    expect(deep(1, 2)).toBe(false);
    expect(deep('test', 'other')).toBe(false);
    expect(deep(true, false)).toBe(false);
    expect(deep(null, undefined)).toBe(false);
  });

  it('should deeply compare nested objects', () => {
    const nested1 = { inner: { value: 1, deep: { level: 2 } } };
    const nested2 = { inner: { value: 1, deep: { level: 2 } } };
    expect(deep(nested1, nested2)).toBe(true);

    const nested3 = { inner: { value: 1, deep: { level: 3 } } };
    expect(deep(nested1, nested3)).toBe(false);
  });

  it('should deeply compare arrays', () => {
    const arr1 = [1, [2, [3, 4]], 5];
    const arr2 = [1, [2, [3, 4]], 5];
    expect(deep(arr1, arr2)).toBe(true);

    const arr3 = [1, [2, [3, 5]], 5];
    expect(deep(arr1, arr3)).toBe(false);
  });

  it('should deeply compare mixed structures', () => {
    const mixed1 = {
      a: 1,
      b: [2, 3],
      c: { d: 4, e: [5, 6] },
      f: new Map([['g', 7], ['h', { i: 8 }]]),
    };
    const mixed2 = {
      a: 1,
      b: [2, 3],
      c: { d: 4, e: [5, 6] },
      f: new Map([['g', 7], ['h', { i: 8 }]]),
    };
    expect(deep(mixed1, mixed2)).toBe(true);

    const mixed3 = {
      a: 1,
      b: [2, 3],
      c: { d: 4, e: [5, 6] },
      f: new Map([['g', 7], ['h', { i: 9 }]]),
    };
    expect(deep(mixed1, mixed3)).toBe(false);
  });

  it('should handle Maps with nested values', () => {
    const map1 = new Map([
      ['a', { value: 1 }],
      ['b', { value: 2 }],
    ]);
    const map2 = new Map([
      ['a', { value: 1 }],
      ['b', { value: 2 }],
    ]);
    expect(deep(map1, map2)).toBe(true);

    const map3 = new Map([
      ['a', { value: 1 }],
      ['b', { value: 3 }],
    ]);
    expect(deep(map1, map3)).toBe(false);
  });

  it('should handle Sets with primitive values', () => {
    const set1 = new Set([1, 2, 3]);
    const set2 = new Set([1, 2, 3]);
    expect(deep(set1, set2)).toBe(true);

    const set3 = new Set([1, 2, 4]);
    expect(deep(set1, set3)).toBe(false);
  });

  it('should handle circular references', () => {
    const obj1: any = { a: 1, b: { c: 2 } };
    obj1.b.parent = obj1;
    const obj2: any = { a: 1, b: { c: 2 } };
    obj2.b.parent = obj2;
    
    expect(() => deep(obj1, obj2)).toThrow(RangeError);
  });

  it('should compare Date objects as plain objects', () => {
    const date1 = new Date('2024-01-01');
    const date2 = new Date('2024-01-01');
    expect(deep(date1, date2)).toBe(true);

    const date3 = new Date('2024-01-02');
    expect(deep(date1, date3)).toBe(true);
  });

  it('should compare RegExp objects as plain objects', () => {
    const regex1 = /test/gi;
    const regex2 = /test/gi;
    expect(deep(regex1, regex2)).toBe(true);

    const regex3 = /other/gi;
    expect(deep(regex1, regex3)).toBe(true);
  });
});