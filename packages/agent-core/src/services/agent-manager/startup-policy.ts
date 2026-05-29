import type { AgentTypes } from '../../types/agent';

/**
 * Host-controlled first-boot behaviour for the agent manager (D16).
 *
 * Electron passes `{ kind: 'auto-create-default', … }` to preserve the
 * legacy product default; CLI/ACP tests pass `{ kind: 'none' }`.
 */
export type AgentManagerStartupPolicy =
  | {
      kind: 'auto-create-default';
      /** Agent row type for the auto-created instance (today always CHAT). */
      agentType: AgentTypes;
      /** When true, mount last-used chat workspaces after DB init. */
      mountLastWorkspaces: boolean;
    }
  | { kind: 'none' };
