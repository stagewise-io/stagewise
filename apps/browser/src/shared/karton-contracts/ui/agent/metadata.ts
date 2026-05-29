import {
  agentsMdEntrySchema,
  agentsMdSnapshotSchema,
  enabledSkillsSnapshotSchema,
  envStateEntrySchema,
  logChannelSnapshotEntrySchema,
  logsSnapshotSchema,
  mountPermissionSchema,
  mountSchema,
  planEntrySchema,
  plansSnapshotSchema,
  planTaskSchema,
  taskGroupSchema,
  workspaceMdEntrySchema,
  workspaceMdSnapshotSchema,
  workspaceSnapshotSchema,
} from '@stagewise/agent-core/env';
import {
  attachmentSchema,
  fileAttachmentSchema,
  fileMentionMetaSchema,
  mentionFileCandidateSchema,
  textClipAttachmentSchema,
  workspaceMentionMetaSchema,
} from '@stagewise/agent-core/types/metadata';
import type {
  AgentsMdSnapshot,
  EnabledSkillsSnapshot,
  EnvStateEntry,
  LogsSnapshot,
  Mount,
  MountPermission,
  PlansSnapshot,
  WorkspaceMdSnapshot,
  WorkspaceSnapshot,
} from '@stagewise/agent-core/env';
import type {
  Attachment,
  AttachmentMetadata,
  FileAttachment,
  FileMentionMeta,
  MentionFileCandidate,
  TextClipAttachment,
  WorkspaceMentionMeta,
  UserMessageMetadata as CoreUserMessageMetadata,
} from '@stagewise/agent-core/types/metadata';
import {
  activeAppSnapshotSchema,
  browserSnapshotSchema,
  browserTabSnapshotSchema,
  logIngestSnapshotSchema,
  shellSessionSnapshotSchema,
  shellSnapshotSchema,
} from '@shared/env-domain-schemas';
import type {
  ActiveAppSnapshot,
  BrowserSnapshot,
  BrowserTabSnapshot,
  LogIngestSnapshot,
  ShellSessionSnapshot,
  ShellSnapshot,
} from '@shared/env-domain-schemas';
import {
  apiSpecSchema,
  modelProviderSchema,
  providerEndpointModeSchema,
} from '../shared-types';
import { z } from 'zod';

export {
  activeAppSnapshotSchema,
  agentsMdEntrySchema,
  agentsMdSnapshotSchema,
  attachmentSchema,
  browserSnapshotSchema,
  browserTabSnapshotSchema,
  enabledSkillsSnapshotSchema,
  envStateEntrySchema,
  fileAttachmentSchema,
  fileMentionMetaSchema,
  logChannelSnapshotEntrySchema,
  logIngestSnapshotSchema,
  logsSnapshotSchema,
  mentionFileCandidateSchema,
  mountPermissionSchema,
  mountSchema,
  planEntrySchema,
  plansSnapshotSchema,
  planTaskSchema,
  shellSessionSnapshotSchema,
  shellSnapshotSchema,
  taskGroupSchema,
  textClipAttachmentSchema,
  workspaceMdEntrySchema,
  workspaceMdSnapshotSchema,
  workspaceMentionMetaSchema,
  workspaceSnapshotSchema,
};

export type {
  ActiveAppSnapshot,
  AgentsMdSnapshot,
  Attachment,
  AttachmentMetadata,
  BrowserSnapshot,
  BrowserTabSnapshot,
  EnabledSkillsSnapshot,
  EnvStateEntry,
  FileAttachment,
  FileMentionMeta,
  LogIngestSnapshot,
  LogsSnapshot,
  MentionFileCandidate,
  Mount,
  MountPermission,
  PlansSnapshot,
  ShellSessionSnapshot,
  ShellSnapshot,
  TextClipAttachment,
  WorkspaceMdSnapshot,
  WorkspaceMentionMeta,
  WorkspaceSnapshot,
};

// ---------------------------------------------------------------------------
// Browser-only mention types (tab mentions are a browser-host concept)
// ---------------------------------------------------------------------------

export const tabMentionMetaSchema = z.object({
  providerType: z.literal('tab'),
  tabId: z.string(),
  url: z.string(),
  title: z.string(),
  faviconUrl: z.string().optional(),
});

export type TabMentionMeta = z.infer<typeof tabMentionMetaSchema>;

export const mentionMetaSchema = z.discriminatedUnion('providerType', [
  fileMentionMetaSchema,
  tabMentionMetaSchema,
  workspaceMentionMetaSchema,
]);

export type MentionMeta = z.infer<typeof mentionMetaSchema>;

export const mentionSchema = mentionMetaSchema;
export type Mention = MentionMeta;

// ---------------------------------------------------------------------------
// Provider-owned reasoning details (browser-host concept: depends on the
// provider/endpoint configuration schemas that live in shared-types)
// ---------------------------------------------------------------------------

export const reasoningSignatureSourceSchema = z
  .object({
    providerMode: providerEndpointModeSchema,
    provider: modelProviderSchema,
    apiSpec: apiSpecSchema.optional(),
    endpointId: z.string().optional(),
    modelId: z.string(),
  })
  .superRefine((source, ctx) => {
    if (source.providerMode !== 'custom') return;
    if (!source.apiSpec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Custom reasoning signature sources require apiSpec',
        path: ['apiSpec'],
      });
    }
    if (!source.endpointId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Custom reasoning signature sources require endpointId',
        path: ['endpointId'],
      });
    }
  });

export type ReasoningSignatureSource = z.infer<
  typeof reasoningSignatureSourceSchema
>;

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
   * `thought_signature` / `format`). We store entries verbatim so
   * forward-compat is preserved — do NOT tighten this schema.
   */
  ownedReasoningDetails: z.array(ownedReasoningDetailsSchema).optional(),
  /**
   * @deprecated Legacy flat signed `reasoning_details` captured before
   * provider ownership was tracked. Kept readable for existing DB rows;
   * conversion consumes it via conservative source inference only.
   */
  reasoningDetails: z.array(z.record(z.string(), z.unknown())).optional(),
});

export type UserMessageMetadata = CoreUserMessageMetadata<MentionMeta>;
