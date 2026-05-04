import { describe, it, expect } from 'vitest';
import type { StagewiseToolSet } from '@shared/karton-contracts/ui/agent/tools/types';
import { stripStrictFromToolSet } from './strip-strict-from-tools';

// `StagewiseToolSet` is a tightly-typed union; the helper operates on an
// opaque record shape. Casting through `unknown` keeps the test inputs
// readable without pulling in the full tool factory machinery.
function toToolSet(input: Record<string, unknown>): Partial<StagewiseToolSet> {
  return input as unknown as Partial<StagewiseToolSet>;
}

describe('stripStrictFromToolSet', () => {
  it('returns a tool without `strict` unchanged (structurally equal)', () => {
    const tool = {
      description: 'no strict here',
      inputSchema: { type: 'object' },
      execute: () => 'ok',
    };

    const out = stripStrictFromToolSet(toToolSet({ myTool: tool }));

    expect(out).toEqual({ myTool: tool });
  });

  it('drops `strict: false` but preserves every other field', () => {
    const tool = {
      description: 'bedrock-hostile',
      inputSchema: { type: 'object' },
      execute: () => 'ok',
      strict: false,
    };

    const out = stripStrictFromToolSet(toToolSet({ myTool: tool })) as Record<
      string,
      Record<string, unknown>
    >;

    expect(out.myTool).not.toHaveProperty('strict');
    expect(out.myTool).toMatchObject({
      description: 'bedrock-hostile',
      inputSchema: { type: 'object' },
    });
    expect(typeof out.myTool.execute).toBe('function');
  });

  it('drops `strict: true` regardless of value', () => {
    const tool = {
      description: 'explicitly strict',
      strict: true,
    };

    const out = stripStrictFromToolSet(toToolSet({ myTool: tool })) as Record<
      string,
      Record<string, unknown>
    >;

    expect(out.myTool).not.toHaveProperty('strict');
    expect(out.myTool.description).toBe('explicitly strict');
  });

  it('passes through non-object entries without crashing', () => {
    // Realistically the tool set never contains `undefined` values, but the
    // helper is defensive against accidental holes; this lock-in test keeps
    // that branch honest.
    const input = toToolSet({
      valid: { description: 'ok', strict: false },
      broken: undefined as any,
    });

    const out = stripStrictFromToolSet(input) as Record<string, unknown>;

    expect(out.valid).toEqual({ description: 'ok' });
    expect(out.broken).toBeUndefined();
  });
});
