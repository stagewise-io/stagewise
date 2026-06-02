import { describe, expect, it, vi } from 'vitest';
import {
  DomainAdapterRegistry,
  defaultEquals,
  resolveEffectiveEnvStates,
  type DomainAdapter,
  type EnvStateEntry,
} from './contract';

function makeAdapter<TState>(
  domainId: string,
  renderOrder: number,
  impl: {
    getState: DomainAdapter<TState>['getState'];
    renderState: DomainAdapter<TState>['renderState'];
    equals?: DomainAdapter<TState>['equals'];
    schemaVersion?: number;
  },
): DomainAdapter<TState> {
  return {
    domainId,
    renderOrder,
    schemaVersion: impl.schemaVersion,
    getState: impl.getState,
    renderState: impl.renderState,
    equals: impl.equals,
  };
}

describe('defaultEquals', () => {
  it('canonicalizes object key order so equivalent objects compare equal', () => {
    expect(defaultEquals({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(defaultEquals({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('handles nested arrays and primitives', () => {
    expect(defaultEquals([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(defaultEquals([1, 2], [1, 2, 3])).toBe(false);
    expect(defaultEquals(null, null)).toBe(true);
    expect(defaultEquals(0, '0')).toBe(false);
  });
});

describe('DomainAdapterRegistry.captureAll', () => {
  it('stamps every adapter on the first turn (no prior state) with renderedStateChange equal to renderedState', async () => {
    const registry = new DomainAdapterRegistry();
    registry.register(
      makeAdapter<{ v: string }>('a', 0, {
        getState: () => ({ v: 'a-curr' }),
        renderState: (prev, curr) =>
          prev ? `delta:${curr.v}` : `full:${curr.v}`,
      }),
    );
    registry.register(
      makeAdapter<{ v: string }>('b', 1, {
        getState: () => ({ v: 'b-curr' }),
        renderState: (prev, curr) =>
          prev ? `delta:${curr.v}` : `full:${curr.v}`,
      }),
    );

    const result = await registry.captureAll({}, 'inst-1', ['a', 'b']);
    expect([...result.entries.keys()].sort()).toEqual(['a', 'b']);
    const a = result.entries.get('a')!;
    expect(a.state).toEqual({ v: 'a-curr' });
    expect(a.renderedState).toBe('full:a-curr');
    expect(a.renderedStateChange).toBe('full:a-curr');
  });

  it('omits domains whose state is unchanged from the previous state', async () => {
    const registry = new DomainAdapterRegistry();
    registry.register(
      makeAdapter<{ v: number }>('static', 0, {
        getState: () => ({ v: 1 }),
        renderState: (_prev, curr) => `v=${curr.v}`,
      }),
    );
    registry.register(
      makeAdapter<{ v: number }>('changing', 1, {
        getState: () => ({ v: 2 }),
        renderState: (prev, curr) =>
          prev ? `delta=${curr.v}` : `full=${curr.v}`,
      }),
    );

    const result = await registry.captureAll(
      { static: { v: 1 }, changing: { v: 1 } },
      'inst-2',
      ['static', 'changing'],
    );
    expect([...result.entries.keys()]).toEqual(['changing']);
    expect(result.entries.get('changing')!.renderedStateChange).toBe('delta=2');
  });

  it('emits both full state and diff when state changed from a prior state', async () => {
    const registry = new DomainAdapterRegistry();
    registry.register(
      makeAdapter<{ count: number }>('counter', 0, {
        getState: () => ({ count: 5 }),
        renderState: (prev, curr) =>
          prev ? `+${curr.count - prev.count}` : `=${curr.count}`,
      }),
    );

    const result = await registry.captureAll(
      { counter: { count: 3 } },
      'inst-3',
      ['counter'],
    );
    const entry = result.entries.get('counter')!;
    expect(entry.renderedState).toBe('=5');
    expect(entry.renderedStateChange).toBe('+2');
  });

  it('respects a custom adapter.equals to short-circuit detection', async () => {
    const equalsSpy = vi.fn().mockReturnValue(true);
    const registry = new DomainAdapterRegistry();
    registry.register(
      makeAdapter<{ stamp: number }>('with-equals', 0, {
        getState: () => ({ stamp: Date.now() }),
        renderState: () => 'rendered',
        equals: equalsSpy,
      }),
    );

    const result = await registry.captureAll(
      { 'with-equals': { stamp: 1 } },
      'inst-4',
      ['with-equals'],
    );
    expect(equalsSpy).toHaveBeenCalledOnce();
    expect(result.entries.size).toBe(0);
  });

  it('isolates a throwing adapter without poisoning the batch', async () => {
    const logger = { error: vi.fn() } as { error: ReturnType<typeof vi.fn> };
    const registry = new DomainAdapterRegistry(
      logger as unknown as ConstructorParameters<
        typeof DomainAdapterRegistry
      >[0],
    );
    registry.register(
      makeAdapter('healthy', 0, {
        getState: () => 'h',
        renderState: () => 'H',
      }),
    );
    registry.register(
      makeAdapter('flaky', 1, {
        getState: () => {
          throw new Error('boom');
        },
        renderState: () => 'F',
      }),
    );

    const result = await registry.captureAll({}, 'inst-5', [
      'healthy',
      'flaky',
    ]);
    expect([...result.entries.keys()]).toEqual(['healthy']);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('listSorted orders adapters by ascending renderOrder', () => {
    const registry = new DomainAdapterRegistry();
    registry.register(
      makeAdapter('z', 10, { getState: () => 0, renderState: () => '' }),
    );
    registry.register(
      makeAdapter('a', 0, { getState: () => 0, renderState: () => '' }),
    );
    expect(registry.listSorted().map((a) => a.domainId)).toEqual(['a', 'z']);
  });

  it('stamps schemaVersion from the adapter (default 1)', async () => {
    const registry = new DomainAdapterRegistry();
    registry.register(
      makeAdapter('versioned', 0, {
        getState: () => 'x',
        renderState: () => 'X',
        schemaVersion: 7,
      }),
    );
    registry.register(
      makeAdapter('default-version', 1, {
        getState: () => 'x',
        renderState: () => 'X',
      }),
    );
    const result = await registry.captureAll({}, 'inst-6', [
      'versioned',
      'default-version',
    ]);
    expect(result.entries.get('versioned')!.schemaVersion).toBe(7);
    expect(result.entries.get('default-version')!.schemaVersion).toBe(1);
  });

  it('returns an empty result when allowedDomainIds is undefined', async () => {
    const registry = new DomainAdapterRegistry();
    registry.register(
      makeAdapter('a', 0, {
        getState: () => 'x',
        renderState: () => 'X',
      }),
    );
    const result = await registry.captureAll({}, 'inst-7');
    expect(result.entries.size).toBe(0);
  });

  it('returns an empty result when allowedDomainIds is an empty array', async () => {
    const registry = new DomainAdapterRegistry();
    registry.register(
      makeAdapter('a', 0, {
        getState: () => 'x',
        renderState: () => 'X',
      }),
    );
    const result = await registry.captureAll({}, 'inst-8', []);
    expect(result.entries.size).toBe(0);
  });

  it('captures only the subset listed in allowedDomainIds', async () => {
    const registry = new DomainAdapterRegistry();
    registry.register(
      makeAdapter('keep', 0, {
        getState: () => ({ v: 'keep' }),
        renderState: () => 'KEEP',
      }),
    );
    registry.register(
      makeAdapter('drop', 1, {
        getState: () => ({ v: 'drop' }),
        renderState: () => 'DROP',
      }),
    );

    const result = await registry.captureAll({}, 'inst-9', ['keep']);
    expect([...result.entries.keys()]).toEqual(['keep']);
  });
});

describe('resolveEffectiveEnvStates', () => {
  function entry(state: unknown): EnvStateEntry {
    return {
      schemaVersion: 1,
      state,
      renderedState: 'r',
      renderedStateChange: 'rc',
    };
  }

  it('walks back and collects the latest state per domain id', () => {
    const messages = [
      { metadata: { envState: { a: entry('a-v1') } } },
      {
        metadata: {
          envState: { a: entry('a-v2'), b: entry('b-v1') },
        },
      },
      { metadata: { envState: { c: entry('c-v1') } } },
    ];
    expect(resolveEffectiveEnvStates(messages, 2)).toEqual({
      a: 'a-v2',
      b: 'b-v1',
      c: 'c-v1',
    });
  });

  it('respects the upToIndex cutoff and ignores later messages', () => {
    const messages = [
      { metadata: { envState: { a: entry('old') } } },
      { metadata: { envState: { a: entry('mid') } } },
      { metadata: { envState: { a: entry('new') } } },
    ];
    expect(resolveEffectiveEnvStates(messages, 1)).toEqual({ a: 'mid' });
  });

  it('skips messages without metadata or envState', () => {
    const messages = [
      {},
      { metadata: {} },
      { metadata: { envState: { a: entry('a') } } },
    ];
    expect(resolveEffectiveEnvStates(messages, 2)).toEqual({ a: 'a' });
  });

  it('returns an empty record when no message has envState', () => {
    expect(resolveEffectiveEnvStates([{}, {}], 1)).toEqual({});
  });
});
