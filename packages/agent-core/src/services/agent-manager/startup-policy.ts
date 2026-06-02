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
      /**
       * Host-supplied resolver for the previously-active agent id, if
       * any. When the resolver returns a non-null id, `AgentManager`
       * attempts to {@link AgentManager.resumeAgent | resume} that
       * agent FIRST. Only when the resolver returns `null`, throws,
       * or the resume itself fails does the manager fall through to
       * the default create-and-mount-last-workspaces flow.
       *
       * Use case: hosts that persist a "last open agent" id alongside
       * the user's tab/window state (Electron's `tab-state.json`)
       * want a seamless restart that drops the user back into their
       * previous session instead of a blank new chat.
       *
       * The agent-core package intentionally does not read this id
       * itself — `tab-state.json` (or any equivalent persistence) is
       * a host-shaped concern.
       */
      getResumeAgentId?: () => Promise<string | null> | string | null;
    }
  | { kind: 'none' };
