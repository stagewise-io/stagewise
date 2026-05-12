import { z } from 'zod';
import { environmentDiffSnapshotSchema } from '../shared-types';

/**
 * A path-based attachment on a user message.
 *
 * `path` is either:
 * - A mount-prefixed workspace path: `"w1/src/button.tsx"` — points directly
 *   into an open workspace; display name is derived from the basename.
 * - A blob path: `"att/my_file_a8kt2m.png"` — a file that was copied into
 *   the agent's data-attachments directory (external drag-in or upload).
 *
 * `originalFileName` is only set for `att/` paths where the blob key is a
 * randomised filename (e.g. `my_file_a8kt2m.png`). It stores the human-
 * readable original name (e.g. `"My Screenshot.png"`) for badge display.
 * For workspace paths the basename of `path` is used directly.
 */
export const attachmentSchema = z.object({
  /** Full path: either `"w{prefix}/..."` (workspace) or `"att/..."` (blob). */
  path: z.string(),
  /**
   * Human-readable original filename. Only set for `att/` paths where the
   * stored filename is randomised. Display code falls back to the basename
   * of `path` when unset.
   */
  originalFileName: z.string().optional(),
});

export type AttachmentMetadata = z.infer<typeof attachmentSchema>;

/** @deprecated Use {@link AttachmentMetadata} instead. Legacy alias kept for backend compat. */
export type Attachment = AttachmentMetadata;

/** @deprecated Use {@link AttachmentMetadata} instead. Legacy alias kept for migration compatibility. */
export const fileAttachmentSchema = attachmentSchema;
/** @deprecated Use {@link AttachmentMetadata} instead. Legacy alias kept for migration compatibility. */
export type FileAttachment = AttachmentMetadata;

/**
 * @deprecated Legacy schema for text clip attachments. New pastes create
 * `.textclip` file attachments instead. Kept for backward-compat with
 * existing DB rows.
 */
export const textClipAttachmentSchema = z.object({
  id: z.string(),
  label: z.string(),
  content: z.string(),
});

/** @deprecated Use file-based `.textclip` attachments instead. */
export type TextClipAttachment = z.infer<typeof textClipAttachmentSchema>;

export const browserTabSnapshotSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  faviconUrl: z.string().optional(),
  consoleErrorCount: z.number().optional(),
  consoleLogCount: z.number().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string().optional(),
    })
    .nullable()
    .optional(),
  lastFocusedAt: z.number().optional(),
});

export type BrowserTabSnapshot = z.infer<typeof browserTabSnapshotSchema>;

export const browserSnapshotSchema = z.object({
  tabs: z.array(browserTabSnapshotSchema),
  activeTabId: z.string().nullable(),
});

export type BrowserSnapshot = z.infer<typeof browserSnapshotSchema>;

export const mountPermissionSchema = z.enum([
  'read',
  'list',
  'create',
  'edit',
  'delete',
]);
export type MountPermission = z.infer<typeof mountPermissionSchema>;

export const mountSchema = z.object({
  prefix: z.string(),
  path: z.string(),
  permissions: z.array(mountPermissionSchema).optional(),
});

export type Mount = z.infer<typeof mountSchema>;

export const workspaceSnapshotSchema = z.object({
  mounts: z.array(mountSchema),
});

export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;

/**
 * Per-provider mention metadata types.
 * These are self-contained snapshots captured at message creation time
 * so the system prompt builder can format them without runtime state.
 */

export const fileMentionMetaSchema = z.object({
  providerType: z.literal('file'),
  /** Mount-prefixed path, e.g. "w234/src/button.tsx" — agent-facing ID */
  mountedPath: z.string(),
  /** Path relative to workspace root, e.g. "src/button.tsx" */
  relativePath: z.string(),
  /** Mount prefix, e.g. "w234" */
  mountPrefix: z.string(),
  /** Base filename, e.g. "button.tsx" */
  fileName: z.string(),
  sizeBytes: z.number().optional(),
  isDirectory: z.boolean().optional(),
});

export type FileMentionMeta = z.infer<typeof fileMentionMetaSchema>;

export const tabMentionMetaSchema = z.object({
  providerType: z.literal('tab'),
  /** Tab ID */
  tabId: z.string(),
  /** Tab URL at mention time */
  url: z.string(),
  /** Tab title at mention time */
  title: z.string(),
  /** First favicon URL at mention time */
  faviconUrl: z.string().optional(),
});

export type TabMentionMeta = z.infer<typeof tabMentionMetaSchema>;

export const workspaceMentionMetaSchema = z.object({
  providerType: z.literal('workspace'),
  /** Mount prefix, e.g. "w1" — agent-facing workspace identifier */
  prefix: z.string(),
  /** Workspace display name (basename of the path) */
  name: z.string(),
  /** Absolute filesystem path */
  path: z.string(),
});

export type WorkspaceMentionMeta = z.infer<typeof workspaceMentionMetaSchema>;

export const mentionMetaSchema = z.discriminatedUnion('providerType', [
  fileMentionMetaSchema,
  tabMentionMetaSchema,
  workspaceMentionMetaSchema,
]);

export type MentionMeta = z.infer<typeof mentionMetaSchema>;

// For v1, Mention === MentionMeta (no file content).
// Future: FileMention will extend FileMentionMeta with { content, truncated }.
export const mentionSchema = mentionMetaSchema;
export type Mention = MentionMeta;

/** Search result returned by toolbox.searchMentionFiles procedure. */
export const mentionFileCandidateSchema = fileMentionMetaSchema.extend({
  relevanceReason: z
    .enum(['pending-diff', 'edit-summary', 'search-match'])
    .optional(),
});

export type MentionFileCandidate = z.infer<typeof mentionFileCandidateSchema>;

export const activeAppSnapshotSchema = z
  .object({
    appId: z.string(),
    pluginId: z.string().optional(),
  })
  .nullable();

export type ActiveAppSnapshot = z.infer<typeof activeAppSnapshotSchema>;

export const agentsMdEntrySchema = z.object({
  mountPrefix: z.string(),
  content: z.string(),
});

export const agentsMdSnapshotSchema = z.object({
  entries: z.array(agentsMdEntrySchema),
  /** Mount prefixes where AGENTS.md is respected (user setting per workspace). */
  respectedMounts: z.array(z.string()),
});

export type AgentsMdSnapshot = z.infer<typeof agentsMdSnapshotSchema>;

export const workspaceMdEntrySchema = z.object({
  mountPrefix: z.string(),
  content: z.string(),
});

export const workspaceMdSnapshotSchema = z.object({
  entries: z.array(workspaceMdEntrySchema),
});

export type WorkspaceMdSnapshot = z.infer<typeof workspaceMdSnapshotSchema>;

export const enabledSkillsSnapshotSchema = z.object({
  /**
   * Mount-prefixed paths to enabled skill directories.
   * Includes both workspace skills (e.g. "w1/.stagewise/skills/my-skill")
   * and plugin skills (e.g. "plugins/my-plugin/SKILL.md").
   * Content is read on demand by the agent.
   */
  paths: z.array(z.string()),
});

export type EnabledSkillsSnapshot = z.infer<typeof enabledSkillsSnapshotSchema>;

export const planTaskSchema = z.object({
  text: z.string(),
  completed: z.boolean(),
  depth: z.number(),
});

export const taskGroupSchema = z.object({
  label: z.string(),
  tasks: z.array(planTaskSchema),
});

export const planEntrySchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  filename: z.string(),
  totalTasks: z.number(),
  completedTasks: z.number(),
  taskGroups: z.array(taskGroupSchema),
});

export const plansSnapshotSchema = z.object({
  entries: z.array(planEntrySchema),
});

export type PlansSnapshot = z.infer<typeof plansSnapshotSchema>;

export const logChannelSnapshotEntrySchema = z.object({
  filename: z.string(),
  byteSize: z.number(),
  lineCount: z.number(),
});

export const logsSnapshotSchema = z.object({
  entries: z.array(logChannelSnapshotEntrySchema),
});

export type LogsSnapshot = z.infer<typeof logsSnapshotSchema>;
export const shellSessionSnapshotSchema = z.object({
  id: z.string(),
  exited: z.boolean(),
  exitCode: z.number().nullable(),
  lineCount: z.number(),
  logPath: z.string(),
  /** Last ~400 chars of log output. Only populated when lineCount > 0. */
  tailContent: z.string().optional(),
  /** Last visible terminal line, derived from headless xterm buffer. */
  lastLine: z.string().optional(),
  /** Working directory the session was started in. */
  cwd: z.string(),
  /** Unix ms timestamp of session creation. */
  createdAt: z.number(),
});

export type ShellSessionSnapshot = z.infer<typeof shellSessionSnapshotSchema>;

export const shellSnapshotSchema = z.object({
  sessions: z.array(shellSessionSnapshotSchema),
});

export type ShellSnapshot = z.infer<typeof shellSnapshotSchema>;

export const environmentSnapshotSchema = z.object({
  browser: browserSnapshotSchema.optional(),
  workspace: workspaceSnapshotSchema.optional(),
  fileDiffs: environmentDiffSnapshotSchema.optional(),
  sandboxSessionId: z.string().nullable().optional(),
  activeApp: activeAppSnapshotSchema.optional(),
  agentsMd: agentsMdSnapshotSchema.optional(),
  workspaceMd: workspaceMdSnapshotSchema.optional(),
  enabledSkills: enabledSkillsSnapshotSchema.optional(),
  /**
   * Unique identifier for the current browser process lifetime.
   * Changes on every app restart. Agents use this to detect restarts
   * and treat all previous tab IDs as invalid.
   */
  browserSessionId: z.string().optional(),
  plans: plansSnapshotSchema.optional(),
  logs: logsSnapshotSchema.optional(),
  logIngest: z
    .object({ port: z.number(), token: z.string() })
    .nullable()
    .optional(),
  shells: shellSnapshotSchema.optional(),
});

export type EnvironmentSnapshot = z.infer<typeof environmentSnapshotSchema>;

/**
 * A fully-resolved environment snapshot where every domain is present.
 * Produced by `resolveEffectiveSnapshot` which walks backward through
 * history to collect the most recent value for each domain.
 */
export type FullEnvironmentSnapshot = Required<EnvironmentSnapshot>;

const metadataSchema = z.object({
  createdAt: z.date(),
  partsMetadata: z.array(
    z
      .object({ startedAt: z.date().optional(), endedAt: z.date().optional() })
      .optional(),
  ), // Metadata for each part of the message - indexed accordingly
  /** Text clip attachments - collapsed long text pasted by user */
  textClipAttachments: z.array(textClipAttachmentSchema).optional(),
  /** Compressed history of the agent in markdown format. Contains information about the whole previous conversation. */
  compressedHistory: z.string().optional(),
  /** Path-based attachments on this message (workspace files or att/ blobs). */
  attachments: z.array(attachmentSchema).optional(),
  /** Snapshot of browser, workspace, and file-diff state at message creation time. Used to compute environment change descriptions between agent turns. */
  environmentSnapshot: environmentSnapshotSchema.optional(),
  /** @-mentions of files, tabs, or other items the user referenced inline */
  mentions: z.array(mentionSchema).optional(),
  /**
   * Map of mount-prefixed file/directory paths to their SHA-256 content hashes
   * at the time this message was processed.
   *
   * **User messages**: Populated from `path:` markdown links in the message text.
   * Recalculated for last message in history (if user message) at every step start so hashes reflect the file state at execution time.
   *
   * **Assistant messages**: Populated from `readFile` tool-call paths at step end.
   * Not populated from assistant `path:` text links.
   *
   * Used by the model-message conversion pipeline to inject file contents
   * into context with deduplication — a `(path, hash)` pair is only injected
   * once across the conversation unless the hash changes.
   */
  pathReferences: z.record(z.string(), z.string()).optional(),
  /**
   * Signed `reasoning_details` captured from the provider response.
   * Re-injected into outbound assistant messages on subsequent requests
   * so providers (Anthropic via Bedrock/OpenRouter, Google) can verify
   * chain-of-thought signatures and keep extending the thinking process.
   *
   * Shape is provider-defined (`reasoning.text`, `reasoning.encrypted`,
   * `reasoning.summary`, etc., each carrying `signature` /
   * `thought_signature` / `format`). We store entries verbatim so
   * forward-compat is preserved — do NOT tighten this schema.
   *
   * Populated by `populateReasoningDetailsOnAssistantMessage` at step end.
   * Consumed by `convertAssistantMessage` when building ModelMessages
   * (attached under `providerOptions.openaiCompatible.reasoning_details`).
   */
  reasoningDetails: z.array(z.record(z.string(), z.unknown())).optional(),
});

export type UserMessageMetadata = z.infer<typeof metadataSchema>;
