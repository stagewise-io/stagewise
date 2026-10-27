import { describe, expect, it, vi } from 'vitest';
import { syncDerivedState } from './sync-derived-state';

type State = {
  plans: Array<{ name: string }>;
  toolbox: Record<string, { mounts: string[] }>;
  streaming: number;
};

function createSource(initial: State) {
  const callbacks = new Set<(state: State) => void>();
  const source = {
    state: initial,
    registerStateChangeCallback: (cb: (state: State) => void) => {
      callbacks.add(cb);
    },
    unregisterStateChangeCallback: (cb: (state: State) => void) => {
      callbacks.delete(cb);
    },
  };
  const setState = (next: State) => {
    source.state = next;
    for (const cb of callbacks) cb(next);
  };
  return { source, setState };
}

describe('syncDerivedState', () => {
  it('skips the snapshot when the selector returns the same reference', () => {
    const plans = [{ name: 'a' }];
    const { source, setState } = createSource({
      plans,
      toolbox: {},
      streaming: 0,
    });
    const snapshotFn = vi.fn(JSON.stringify);
    const onChanged = vi.fn();
    syncDerivedState(source, (state) => state.plans, onChanged, {
      snapshotFn,
    });

    setState({ ...source.state, streaming: 1 });
    setState({ ...source.state, streaming: 2 });
    expect(snapshotFn).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);

    setState({ ...source.state, plans: [{ name: 'b' }] });
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenLastCalledWith([{ name: 'b' }]);
  });

  it('skips the selector while all inputs are reference-equal', () => {
    const toolbox = { agent: { mounts: ['/repo'] } };
    const { source, setState } = createSource({
      plans: [],
      toolbox,
      streaming: 0,
    });
    const selector = vi.fn((state: State) =>
      Object.values(state.toolbox).flatMap((entry) => entry.mounts),
    );
    const onChanged = vi.fn();
    syncDerivedState(source, selector, onChanged, {
      inputs: (state) => [state.toolbox],
    });

    setState({ ...source.state, streaming: 1 });
    setState({ ...source.state, streaming: 2 });
    expect(selector).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);

    // A new toolbox with the same content reruns the selector but does not
    // fire, because the snapshot is unchanged.
    setState({ ...source.state, toolbox: { agent: { mounts: ['/repo'] } } });
    expect(selector).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);

    setState({ ...source.state, toolbox: { agent: { mounts: ['/other'] } } });
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenLastCalledWith(['/other']);
  });

  it('fires immediately when requested', () => {
    const { source } = createSource({ plans: [], toolbox: {}, streaming: 0 });
    const onChanged = vi.fn();
    syncDerivedState(source, (state) => state.streaming, onChanged, {
      fireImmediately: true,
    });
    expect(onChanged).toHaveBeenCalledWith(0);
  });
});
