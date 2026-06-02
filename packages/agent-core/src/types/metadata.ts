import { z } from 'zod';
import { envStateEntrySchema } from '../env/contract';

export {
  mountPermissionSchema,
  mountSchema,
  workspaceSnapshotSchema,
} from '../env/types';
export type {
  Mount,
  MountPermission,
  WorkspaceSnapshot,
} from '../env/types';

/**
 * A path-based attachment on a user message.
 *
 * `path` is either a mount-prefixed workspace path or an `att/` blob path.
 */
export const attachmentSchema = z.object({
  path: z.string(),
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

export const fileMentionMetaSchema = z.object({
  providerType: z.literal('file'),
  mountedPath: z.string(),
  relativePath: z.string(),
  mountPrefix: z.string(),
  fileName: z.string(),
  sizeBytes: z.number().optional(),
  isDirectory: z.boolean().optional(),
});

export type FileMentionMeta = z.infer<typeof fileMentionMetaSchema>;

export const workspaceMentionMetaSchema = z.object({
  providerType: z.literal('workspace'),
  prefix: z.string(),
  name: z.string(),
  path: z.string(),
});

export type WorkspaceMentionMeta = z.infer<typeof workspaceMentionMetaSchema>;

/**
 * Catch-all schema for host-defined mention kinds (e.g. browser tab
 * mentions, host symbol mentions). Core only enforces that the
 * `providerType` discriminator exists; the host owns strict per-shape
 * validation via its own schema overlay (see e.g.
 * `apps/browser/src/shared/karton-contracts/ui/agent/metadata.ts`).
 */
export const hostMentionMetaSchema = z
  .object({ providerType: z.string() })
  .passthrough();

export type HostMentionMeta = z.infer<typeof hostMentionMetaSchema>;

/**
 * Open mention schema: the core-known `file` / `workspace` shapes,
 * plus any host-defined kind matched via {@link hostMentionMetaSchema}.
 *
 * Core never validates user-message metadata at runtime against this
 * schema — it's exposed for hosts that want to reuse the core shapes
 * inside their own validation overlay.
 */
export const mentionMetaSchema = z.union([
  fileMentionMetaSchema,
  workspaceMentionMetaSchema,
  hostMentionMetaSchema,
]);

export type MentionMeta =
  | FileMentionMeta
  | WorkspaceMentionMeta
  | HostMentionMeta;

export const mentionSchema = mentionMetaSchema;
export type Mention = MentionMeta;

export const mentionFileCandidateSchema = fileMentionMetaSchema.extend({
  relevanceReason: z
    .enum(['pending-diff', 'edit-summary', 'search-match'])
    .optional(),
});

export type MentionFileCandidate = z.infer<typeof mentionFileCandidateSchema>;

/**
 * Identifies the semantic provider route that produced a set of signed
 * `reasoning_details`. Stored alongside the details so conversion can
 * re-inject signatures only for compatible future requests (never across
 * provider boundaries).
 *
 * Core keeps `provider` / `apiSpec` as opaque strings so it stays
 * host-agnostic; hosts (e.g. the browser) may validate them against a
 * stricter enum in their own contract overlay.
 */
export const reasoningSignatureSourceSchema = z.object({
  providerMode: z.enum(['stagewise', 'official', 'custom']),
  provider: z.string(),
  apiSpec: z.string().optional(),
  endpointId: z.string().optional(),
  modelId: z.string(),
});

export type ReasoningSignatureSource = z.infer<
  typeof reasoningSignatureSourceSchema
>;

/**
 * A group of signed `reasoning_details` together with the
 * {@link ReasoningSignatureSource} that produced them. Entries are stored
 * verbatim (`details`) so provider forward-compat is preserved — do NOT
 * tighten the inner record shape.
 */
export const ownedReasoningDetailsSchema = z.object({
  source: reasoningSignatureSourceSchema,
  details: z.array(z.record(z.string(), z.unknown())).min(1),
});

export type OwnedReasoningDetails = z.infer<typeof ownedReasoningDetailsSchema>;

export const metadataSchema = z.object({
  createdAt: z.date(),
  partsMetadata: z.array(
    z
      .object({ startedAt: z.date().optional(), endedAt: z.date().optional() })
      .optional(),
  ),
  textClipAttachments: z.array(textClipAttachmentSchema).optional(),
  compressedHistory: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
  /**
   * Per-domain env-state entries written by
   * {@link DomainAdapterRegistry.captureAll}. Keyed by `domainId`. Only
   * domains whose state changed (or that had no prior state) appear here;
   * unchanged domains inherit from the most recent earlier user message
   * that carries them. See `env/env-state-spec.md`.
   */
  envState: z.record(z.string(), envStateEntrySchema).optional(),
  mentions: z.array(mentionSchema).optional(),
  pathReferences: z.record(z.string(), z.string()).optional(),
  /**
   * Provider-owned signed `reasoning_details` captured from the provider
   * response. Re-injected only when the outbound model route matches the
   * semantic owner so Anthropic/Google/OpenAI signatures are never replayed
   * across provider boundaries.
   *
   * Shape is provider-defined (`reasoning.text`, `reasoning.encrypted`,
   * `reasoning.summary`, etc., each carrying `signature` /
   * `thought_signature` / `format`). Stored verbatim — do NOT tighten.
   */
  ownedReasoningDetails: z.array(ownedReasoningDetailsSchema).optional(),
  /**
   * @deprecated Legacy flat signed `reasoning_details` captured before
   * provider ownership was tracked. Kept readable for existing rows;
   * conversion consumes it via conservative source inference only.
   */
  reasoningDetails: z.array(z.record(z.string(), z.unknown())).optional(),
});

export type UserMessageMetadata<TMention = MentionMeta> = Omit<
  z.infer<typeof metadataSchema>,
  'mentions'
> & {
  mentions?: TMention[];
};

/**
 * Snapshot of a mount's git working-state. Captures the resolved
 * repository/worktree identity and a coarse status summary that hosts
 * can render without re-shelling out to git. Hosts own the *production*
 * of this summary (e.g. via a host-side GitService); core only carries
 * it as opaque mount metadata.
 */
export type WorkspaceGitSummary = {
  /**
   * Stable identifier for the repository (independent of which worktree
   * is checked out). Hosts typically derive this from the common git
   * directory.
   */
  repositoryId: string;
  /** Stable identifier for the specific worktree the mount points at. */
  worktreeId: string;
  /** Absolute path to the worktree's repo root. */
  repoRoot: string;
  /** Absolute path to the repository's main worktree, or `null` when unknown. */
  mainWorktreePath: string | null;
  /** Absolute path to the shared `.git` (or `.git/worktrees/<id>`) dir. */
  commonGitDir: string;
  /** True when the mount points at a linked worktree (not the main one). */
  isWorktree: boolean;
  /** Current branch name, or `null` for a detached HEAD. */
  branch: string | null;
  /** Current commit SHA, or `null` when not resolvable. */
  headSha: string | null;
  /**
   * Coarse working-tree status counts. `null` when the host has not yet
   * produced a status snapshot for this mount.
   */
  status: {
    dirty: boolean;
    stagedCount: number;
    unstagedCount: number;
    untrackedCount: number;
  } | null;
};

export type MountEntry = {
  prefix: string;
  path: string;
  /**
   * Git working-state for this mount, or `null` when the mount is not a
   * git repository (or the host has not yet produced a summary).
   */
  git: WorkspaceGitSummary | null;
  skills: Array<{ name: string; description: string }>;
  /** Full file content, or `null` when the file does not exist on disk. */
  workspaceMdContent: string | null;
  /** Full file content, or `null` when the file does not exist on disk. */
  agentsMdContent: string | null;
};
