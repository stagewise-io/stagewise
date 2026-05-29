/**
 * Host-owned raw data feeds consumed by the core-owned env-state
 * `DomainAdapter` implementations.
 *
 * Each method returns the minimal raw data an adapter needs that the
 * core cannot compute from `AgentStore`, `MountManager`, persistence,
 * or the `fs` proxy alone. Keeping these feeds narrow avoids pulling
 * host-internal service structure (Karton slices, preferences tree) into
 * the core.
 *
 * Hosts supply an implementation as `AgentHost.environmentSources`.
 * Individual adapters null-check their dependencies so a host may ship
 * without some feeds (e.g. a CLI host without a global-skills index).
 */

/** Entry in the resolved skills list for a given agent instance. */
export interface ResolvedSkillEntry {
  /** Stable id (e.g. `skill:foo`, `plugin:x:y`). */
  id: string;
  /** Skill name rendered to the user. */
  displayName: string;
  /** One-line description. */
  description: string;
  /**
   * Mount-prefixed path of the skill's container directory
   * (e.g. `wXXX/.stagewise/skills/foo`, `plugins/github/SKILL.md`).
   * Absent for builtins.
   */
  skillPath?: string;
  /** Whether the skill should be advertised to the agent in prompts. */
  agentInvocable?: boolean;
}

/** Per-workspace user setting relevant to env-snapshot providers. */
export interface WorkspaceAgentSettingsEntry {
  /** Whether `AGENTS.md` content should be included in the prompt. */
  respectAgentsMd: boolean;
  /** Skill names that are disabled for this workspace. */
  disabledSkills: string[];
}

/** Static global-skills mount definition surfaced by the host. */
export interface GlobalSkillsMount {
  /** Mount prefix used in the agent-facing workspace list. */
  prefix: string;
  /** Absolute directory containing this mount's skill directories. */
  absolutePath: string;
  /** `true` when the absolute path exists on disk right now. */
  exists: boolean;
}

/**
 * Raw data feeds the host exposes for core-owned environment
 * providers. Implementors are expected to resolve queries from
 * host-internal state (Karton, file system, config tree).
 */
export interface HostEnvironmentSources {
  /**
   * Resolved skills visible to this agent (builtin + workspace +
   * global + plugin, after disable filtering). Used by the
   * `EnabledSkillsProvider` to enumerate `agentInvocable` paths.
   */
  getResolvedSkillsForAgent(
    agentInstanceId: string,
  ): Promise<ResolvedSkillEntry[]>;

  /**
   * Per-workspace agent settings for every mount attached to this
   * agent. Keyed by the absolute workspace path (not the mount
   * prefix). Missing keys imply default settings.
   */
  getWorkspaceAgentSettings(
    agentInstanceId: string,
  ): Map<string, WorkspaceAgentSettingsEntry>;

  /**
   * Static global-skills mounts exposed in the workspace snapshot
   * (e.g. `~/.stagewise/skills`, `~/.agents/skills`). The host is
   * responsible for filtering out entries that do not exist on disk
   * (`exists: false` entries are still emitted so callers can log or
   * diagnose).
   */
  getGlobalSkillsMounts(): GlobalSkillsMount[];
}
