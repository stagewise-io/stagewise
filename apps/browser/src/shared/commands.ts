/**
 * Full command definition used by the backend.
 * Includes `contentPath` for lazy content loading.
 */
export type CommandDefinition = {
  id: string;
  displayName: string;
  description: string;
  source: 'builtin';
  /** Absolute path to the command `.md` file — resolved lazily at injection time */
  contentPath: string;
  /** When true, the command is available to the agent but hidden from the slash-command UI. */
  hidden?: boolean;
};

/**
 * UI-facing command definition (excludes backend-only fields).
 * Pushed to Karton state at startup.
 */
export type CommandDefinitionUI = {
  id: string;
  displayName: string;
  description: string;
  source: 'builtin';
  /** When true, the command is available to the agent but hidden from the slash-command UI. */
  hidden?: boolean;
};
