import {
  AgentTypeRegistry,
  WorkspaceMdAgent,
} from '@stagewise/agent-core/agents';
import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import { BrowserChatAgent } from './chat/chat';

// Module side-effect import: pulls in the `declare module` augmentation
// of `AgentTypeMap` so that `registry.register(AgentTypes.CHAT, …)`
// type-checks against the concrete `BrowserChatAgent` constructor.
import './agents-map';

/**
 * Build the browser host's `AgentTypeRegistry` instance.
 *
 * The registry is intentionally constructed once at boot and threaded
 * into `AgentManagerService` (and downstream into
 * `BaseAgent.spawnChildAgentHandler` via `BaseAgentDependencies`). It
 * gives the core access to host-defined agent constructors without the
 * core package having to import them — preserving the Split-Brain
 * boundary.
 */
export function createBrowserAgentTypeRegistry(): AgentTypeRegistry {
  const registry = new AgentTypeRegistry();
  registry.register(AgentTypes.CHAT, BrowserChatAgent);
  registry.register(AgentTypes.WORKSPACE_MD, WorkspaceMdAgent);
  return registry;
}
