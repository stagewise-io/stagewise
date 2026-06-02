import type { CommandRegistry } from '../../commands/command-registry';
import type { AgentManager } from './agent-manager';

/**
 * Phase 9 command registration seam.
 *
 * `AgentManager` currently self-registers command handlers in its constructor
 * to preserve legacy startup behavior. This helper remains the public API
 * expected by the migration plan and can be used by hosts that instantiate
 * a manager without auto-registration.
 */
export function registerAgentManagerCommands(
  _registry: CommandRegistry,
  manager: AgentManager,
): () => void {
  const maybeRegister = (
    manager as unknown as {
      registerCommandHandlers?: () => () => void;
    }
  ).registerCommandHandlers;

  if (!maybeRegister) {
    return () => {};
  }

  return maybeRegister.call(manager);
}
