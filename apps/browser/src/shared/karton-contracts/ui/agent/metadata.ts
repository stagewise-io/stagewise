import { z } from 'zod';
import { selectedElementSchema } from '../../../selected-elements';
import { environmentDiffSnapshotSchema } from '../shared-types';

/**
 * Schema for file attachments.
 * Lightweight metadata only — binary content is stored on disk at
 * `<dataRoot>/agents/<agentId>/data-attachments/<attachmentId>`.
 * The backend reads blobs from disk when building LLM prompts.
 * Agents access attachments via `fs.readFile('att/{id}')` in the sandbox.
 */
export const fileAttachmentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mediaType: z.string(),
  sizeBytes: z.number(),
});

export type FileAttachment = z.infer<typeof fileAttachmentSchema>;

/**
 * Schema for text clip attachments - collapsed long text pasted by user.
 * These are stored in metadata so the agent can correlate @{id} references
 * in the user message with the full text content.
 */
export const textClipAttachmentSchema = z.object({
  /** Unique identifier matching the @{id} reference in user message */
  id: z.string(),
  /** Truncated preview label shown in UI */
  label: z.string(),
  /** Full pasted text content */
  content: z.string(),
});

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

export const environmentSnapshotSchema = z.object({
  browser: browserSnapshotSchema.optional(),
  workspace: workspaceSnapshotSchema.optional(),
  fileDiffs: environmentDiffSnapshotSchema.optional(),
  sandboxSessionId: z.string().nullable().optional(),
  activeApp: activeAppSnapshotSchema.optional(),
  agentsMd: agentsMdSnapshotSchema.optional(),
  workspaceMd: workspaceMdSnapshotSchema.optional(),
  enabledSkills: enabledSkillsSnapshotSchema.optional(),
});

export type EnvironmentSnapshot = z.infer<typeof environmentSnapshotSchema>;

/**
 * A fully-resolved environment snapshot where every domain is present.
 * Produced by `resolveEffectiveSnapshot` which walks backward through
 * history to collect the most recent value for each domain.
 */
export type FullEnvironmentSnapshot = Required<EnvironmentSnapshot>;

const stagewiseProviderSchema = z.object({
  finalProvider: z.string().optional(),
  finalModel: z.string().optional(),
  limits: z.object({}),
});

export type StagewiseProviderMeta = z.infer<typeof stagewiseProviderSchema>;

const metadataSchema = z.object({
  createdAt: z.date(),
  partsMetadata: z.array(
    z
      .object({ startedAt: z.date().optional(), endedAt: z.date().optional() })
      .optional(),
  ), // Metadata for each part of the message - indexed accordingly
  selectedPreviewElements: z.array(selectedElementSchema).optional(),
  /** Text clip attachments - collapsed long text pasted by user */
  textClipAttachments: z.array(textClipAttachmentSchema).optional(),
  /** Compressed history of the agent in markdown format. Contains information about the whole previous conversation. */
  compressedHistory: z.string().optional(),
  /** Lightweight file attachment metadata (content stored on disk). */
  fileAttachments: z.array(fileAttachmentSchema).optional(),
  /** Snapshot of browser, workspace, and file-diff state at message creation time. Used to compute environment change descriptions between agent turns. */
  environmentSnapshot: environmentSnapshotSchema.optional(),
  /** @-mentions of files, tabs, or other items the user referenced inline */
  mentions: z.array(mentionSchema).optional(),
  /** Provider routing metadata returned by the stagewise gateway. */
  stagewiseProvider: stagewiseProviderSchema.optional(),
});

export type UserMessageMetadata = z.infer<typeof metadataSchema>;
