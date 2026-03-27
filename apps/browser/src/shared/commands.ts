/**
 * Source of a slash command.
 * - `builtin` — shipped with the app (bundled/skills/)
 * - `workspace` — discovered from a mounted workspace skill
 * - `plugin` — discovered from a bundled plugin skill
 */
export type CommandSource = 'builtin' | 'workspace' | 'plugin';

/**
 * Full command definition used by the backend.
 * Includes `contentPath` for lazy content loading at inference time.
 */
export type CommandDefinition = {
  id: string;
  displayName: string;
  description: string;
  source: CommandSource;
  /** Absolute path to the content file — resolved lazily at injection time. */
  contentPath: string;
  /**
   * Agent-facing path used in the env-snapshot skills list.
   * Mount-prefixed for workspace skills (e.g. `w1/.stagewise/skills/foo`),
   * `plugins/{id}/SKILL.md` for plugin skills.
   * Absent for builtins.
   */
  skillPath?: string;
  /** Whether this item appears in the slash-command popup. Defaults to `true` when absent. */
  userInvocable?: boolean;
  /** Whether this item appears in the system prompt for the agent. Defaults to `true` when absent. */
  agentInvocable?: boolean;
  /**
   * Mount prefix of the workspace that owns this command.
   * Only set when `source === 'workspace'`.
   */
  workspacePrefix?: string;
  /**
   * Plugin identifier that owns this command.
   * Only set when `source === 'plugin'`.
   */
  pluginId?: string;
};

/**
 * UI-facing command definition (excludes backend-only fields like `contentPath`).
 * Pushed to Karton state and consumed by the suggestion popup.
 */
export type CommandDefinitionUI = Omit<CommandDefinition, 'contentPath'>;

/**
 * Strip backend-only fields from a `CommandDefinition` to produce
 * a `CommandDefinitionUI` suitable for Karton state.
 */
export function toCommandDefinitionUI(
  cmd: CommandDefinition,
): CommandDefinitionUI {
  const { contentPath: _, ...ui } = cmd;
  return ui;
}
