import { describe, expect, it, vi } from 'vitest';
import { CommandRegistry } from '../../commands/command-registry';
import { registerAgentManagerCommands } from './register-agent-manager-commands';

describe('registerAgentManagerCommands', () => {
  it('delegates to manager.registerCommandHandlers when available', () => {
    const unregister = vi.fn();
    const manager = {
      registerCommandHandlers: vi.fn(() => unregister),
    };
    const result = registerAgentManagerCommands(
      new CommandRegistry(),
      manager as any,
    );
    expect(manager.registerCommandHandlers).toHaveBeenCalledTimes(1);
    expect(result).toBe(unregister);
  });

  it('returns a noop unregister when manager has no registration method', () => {
    const result = registerAgentManagerCommands(
      new CommandRegistry(),
      {} as any,
    );
    expect(typeof result).toBe('function');
    expect(() => result()).not.toThrow();
  });
});
