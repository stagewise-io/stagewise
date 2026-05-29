import { describe, expect, it, vi } from 'vitest';
import {
  CommandRegistry,
  DuplicateCommandError,
  UnknownCommandError,
} from './command-registry';

describe('CommandRegistry', () => {
  it('round-trips a registered command and returns the handler result', async () => {
    const registry = new CommandRegistry();
    registry.registerCommand<{ x: number }, number>(
      'math.double',
      async (_ctx, args) => args.x * 2,
    );
    const result = await registry.dispatch<{ x: number }, number>(
      'math.double',
      { callerId: 'ui' },
      { x: 21 },
    );
    expect(result).toBe(42);
  });

  it('forwards ctx.callerId and args unchanged to the handler', async () => {
    const registry = new CommandRegistry();
    const handler = vi.fn(async () => 'ok');
    registry.registerCommand('agents.ping', handler);
    await registry.dispatch(
      'agents.ping',
      { callerId: 'cli' },
      { greeting: 'hello' },
    );
    expect(handler).toHaveBeenCalledWith(
      { callerId: 'cli' },
      { greeting: 'hello' },
    );
  });

  it('throws UnknownCommandError for an unregistered command', async () => {
    const registry = new CommandRegistry();
    await expect(
      registry.dispatch('agents.missing', { callerId: 'ui' }, {}),
    ).rejects.toBeInstanceOf(UnknownCommandError);
  });

  it('throws DuplicateCommandError on re-registration', () => {
    const registry = new CommandRegistry();
    registry.registerCommand('agents.ping', async () => null);
    expect(() =>
      registry.registerCommand('agents.ping', async () => null),
    ).toThrow(DuplicateCommandError);
  });

  it('unregister function removes the handler and subsequent dispatch throws', async () => {
    const registry = new CommandRegistry();
    const unregister = registry.registerCommand(
      'agents.ping',
      async () => 'hit',
    );
    expect(registry.has('agents.ping')).toBe(true);
    unregister();
    expect(registry.has('agents.ping')).toBe(false);
    await expect(
      registry.dispatch('agents.ping', { callerId: 'ui' }, {}),
    ).rejects.toBeInstanceOf(UnknownCommandError);
  });

  it('propagates handler rejections unchanged', async () => {
    const registry = new CommandRegistry();
    registry.registerCommand('agents.boom', async () => {
      throw new Error('handler failure');
    });
    await expect(
      registry.dispatch('agents.boom', { callerId: 'ui' }, {}),
    ).rejects.toThrow(/handler failure/);
  });

  it('list() returns registered command names in insertion order', () => {
    const registry = new CommandRegistry();
    registry.registerCommand('a.first', async () => null);
    registry.registerCommand('b.second', async () => null);
    registry.registerCommand('c.third', async () => null);
    expect(registry.list()).toEqual(['a.first', 'b.second', 'c.third']);
  });
});
