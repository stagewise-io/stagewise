import {
  type ModelMessage,
  convertToModelMessages,
  type UserModelMessage,
  type ToolSet,
  type UserContent,
  type TextPart,
  type ImagePart,
  type FilePart,
} from 'ai';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type { FullEnvironmentSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import type { SelectedElement } from '@shared/selected-elements';
import {
  computeAllEnvironmentChanges,
  renderEnvironmentChangesXml,
  resolveEffectiveSnapshot,
} from '../prompts/utils/environment-changes';
import {
  renderFullEnvironmentContext,
  type ShellInfo,
} from '../prompts/system/environment-renderer';
import type { SkillInfo } from '../prompts/system/skills';
import { deepMergeProviderOptions } from '@/agents/model-provider';
import {
  relevantCodebaseFilesToContextSnippet,
  selectedElementToContextSnippet,
} from '../prompts/utils/metadata-converter/html-elements';
import { textClipToContextSnippet } from '../prompts/utils/metadata-converter/text-clips';
import { mentionToContextSnippet } from '../prompts/utils/metadata-converter/mentions';
import xml from 'xml';
import specialTokens from '../prompts/utils/special-tokens';
import type { ModelCapabilities } from '@shared/karton-contracts/ui/shared-types';
import { findModelsAcceptingMime } from '@shared/available-models';
import type { AssetCacheService } from '@/services/asset-cache';
import { getBlobPath } from '@/utils/attachment-blobs';

export type BlobReader = (
  agentId: string,
  attachmentId: string,
) => Promise<Buffer>;

export type BlobErrorReporter = (
  error: unknown,
  context: { operation: string; attachmentId: string },
) => void;

/**
 * Internal type for file attachments produced by the sandbox at runtime.
 * The sandbox writes binary data directly to the `att/` mount; this type
 * carries only metadata registered via `API.outputAttachment`.
 */
export interface SandboxFileAttachment {
  id: string;
  mediaType: string;
  fileName: string;
  sizeBytes: number;
}

import type { ModalityConstraint } from '@shared/karton-contracts/ui/shared-types';

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function isImageMime(mediaType: string): boolean {
  return IMAGE_MIME_TYPES.has(mediaType.toLowerCase());
}

const DEFAULT_IMAGE_CONSTRAINT: ModalityConstraint = {
  mimeTypes: [...IMAGE_MIME_TYPES],
  maxBytes: 5_242_880, // 5 MB — conservative fallback
};

const DEFAULT_FILE_CONSTRAINT: ModalityConstraint = {
  mimeTypes: ['application/pdf'],
  maxBytes: 20_971_520, // 20 MB — conservative fallback
};

function formatMB(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

type ConstraintMatch =
  | { mime: true; size: true }
  | { mime: true; size: false; maxBytes: number }
  | { mime: false };

function checkConstraint(
  constraint: ModalityConstraint,
  mime: string,
  sizeBytes: number,
): ConstraintMatch {
  if (!constraint.mimeTypes.includes(mime)) return { mime: false };
  const base64Size = Math.ceil((sizeBytes * 4) / 3);
  if (base64Size <= constraint.maxBytes) return { mime: true, size: true };
  return { mime: true, size: false, maxBytes: constraint.maxBytes };
}

type AttachmentCheck =
  | { canConsume: true }
  | { canConsume: false; reason: string };

/**
 * Runtime check: can the current model consume this attachment as an
 * inline file part?  Uses per-model `inputConstraints` when available,
 * otherwise falls back to conservative defaults for image/file.
 * Video and audio require explicit constraints — no defaults.
 *
 * Returns a rejection reason when the attachment cannot be consumed.
 */
function canModelConsumeAttachment(
  capabilities: ModelCapabilities | undefined,
  mediaType: string,
  sizeBytes: number,
  currentModelId?: string,
): AttachmentCheck {
  if (!capabilities)
    return { canConsume: false, reason: 'Model capabilities unknown.' };
  const mime = mediaType.toLowerCase();
  const constraints = capabilities.inputConstraints;

  const modalityChecks: {
    name: string;
    enabled: boolean;
    constraint: ModalityConstraint | undefined;
  }[] = [
    {
      name: 'image',
      enabled: capabilities.inputModalities.image,
      constraint: constraints?.image ?? DEFAULT_IMAGE_CONSTRAINT,
    },
    {
      name: 'file',
      enabled: capabilities.inputModalities.file,
      constraint: constraints?.file ?? DEFAULT_FILE_CONSTRAINT,
    },
    {
      name: 'video',
      enabled: capabilities.inputModalities.video,
      constraint: constraints?.video,
    },
    {
      name: 'audio',
      enabled: capabilities.inputModalities.audio,
      constraint: constraints?.audio,
    },
  ];

  let sizeExceeded: { name: string; maxBytes: number } | undefined;

  for (const m of modalityChecks) {
    if (!m.enabled || !m.constraint) continue;
    const result = checkConstraint(m.constraint, mime, sizeBytes);
    if ('size' in result && result.size) return { canConsume: true };
    if ('size' in result && !result.size && !sizeExceeded)
      sizeExceeded = { name: m.name, maxBytes: result.maxBytes };
  }

  if (sizeExceeded) {
    return {
      canConsume: false,
      reason: `File too large for inline ${sizeExceeded.name} input (${formatMB(sizeBytes)} exceeds ~${formatMB(Math.floor((sizeExceeded.maxBytes * 3) / 4))} limit).`,
    };
  }

  const alternatives = findModelsAcceptingMime(mime, currentModelId);
  const altSuffix =
    alternatives.length > 0
      ? ` Models supporting ${mime}: ${alternatives.join(', ')}.`
      : '';

  const allSupported = modalityChecks
    .filter((m) => m.enabled && m.constraint)
    .flatMap((m) => m.constraint!.mimeTypes);

  if (allSupported.length > 0) {
    return {
      canConsume: false,
      reason: `This model doesn't support ${mime} inline.${altSuffix}`,
    };
  }

  return {
    canConsume: false,
    reason: `This model has no inline file input support.${altSuffix}`,
  };
}

/**
 * Strip all underscore-prefixed properties from a tool output object.
 * This allows tool implementations to attach UI-only metadata (e.g. `_diff`)
 * that is visible in the UI but automatically excluded from model context.
 */
export function stripUnderscoreProperties(
  output: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(output).filter(([key]) => !key.startsWith('_')),
  );
}

/**
 * Collect all `_customFileAttachments` from tool part outputs on an
 * assistant message. These are multimodal attachments produced by the
 * sandbox during script execution that need to be injected as a
 * synthetic user message so the LLM can "see" them.
 */
function collectCustomFileAttachments(
  message: AgentMessage,
): SandboxFileAttachment[] {
  const attachments: SandboxFileAttachment[] = [];
  for (const part of message.parts) {
    if (
      (part.type.startsWith('tool-') || part.type === 'dynamic-tool') &&
      'output' in part &&
      part.output &&
      typeof part.output === 'object'
    ) {
      const output = part.output as Record<string, unknown>;
      const custom = output._customFileAttachments;
      if (Array.isArray(custom))
        attachments.push(...(custom as SandboxFileAttachment[]));
    }
  }
  return attachments;
}

/**
 * Build a synthetic `UserModelMessage` carrying multimodal file/image
 * parts for custom file attachments collected from sandbox tool outputs.
 * Binary content is read from disk via the `att/` mount.
 */
async function buildSyntheticUserMessageForAttachments(
  attachments: SandboxFileAttachment[],
  agentInstanceId: string,
  blobReader: BlobReader,
  capabilities?: ModelCapabilities,
  onBlobError?: BlobErrorReporter,
  currentModelId?: string,
  assetCacheService?: AssetCacheService,
): Promise<UserModelMessage> {
  const content: UserContent = [];

  for (const f of attachments) {
    const check = canModelConsumeAttachment(
      capabilities,
      f.mediaType,
      f.sizeBytes,
      currentModelId,
    );
    const hint = check.canConsume
      ? 'Sandbox-produced attachment. See next part for inline content.'
      : `${check.reason} Access via fs.readFile('att/${f.id}') in the sandbox. To view inline, read it, resize/compress to a new file, then API.outputAttachment() the smaller copy.`;

    content.push({
      type: 'text',
      text: xml({
        [specialTokens.userMsgAttachmentXmlTag]: {
          _attr: {
            type: 'file',
            filename: f.fileName,
            id: f.id,
            hint,
          },
        },
      }),
    });

    if (check.canConsume) {
      try {
        const filePath = getBlobPath(agentInstanceId, f.id);
        const result = await assetCacheService?.resolve(
          filePath,
          f.mediaType,
          f.fileName,
        );
        if (result?.type === 'url') {
          if (isImageMime(f.mediaType)) {
            content.push({
              type: 'image',
              image: new URL(result.url),
              mediaType: f.mediaType,
            } satisfies ImagePart);
          } else {
            content.push({
              type: 'file',
              data: new URL(result.url),
              mediaType: f.mediaType,
              filename: f.fileName,
            } satisfies FilePart);
          }
        } else {
          const buf =
            result?.buffer ?? (await blobReader(agentInstanceId, f.id));
          if (isImageMime(f.mediaType)) {
            content.push({
              type: 'image',
              image: new Uint8Array(buf),
              mediaType: f.mediaType,
            } satisfies ImagePart);
          } else {
            content.push({
              type: 'file',
              data: new Uint8Array(buf),
              mediaType: f.mediaType,
              filename: f.fileName,
            } satisfies FilePart);
          }
        }
      } catch (err) {
        onBlobError?.(err, {
          operation: 'readSandboxAttachmentBlob',
          attachmentId: f.id,
        });
      }
    }
  }

  return { role: 'user', content };
}

/**
 * Converts UI messages to model messages for LLM consumption.
 *
 * ## High-level pipeline
 *
 * ```
 * UI Messages (AgentMessage[])
 *   │
 *   ▼  Step 1 — Find compression boundary
 *   │  Scan backward for the last message with compressedHistory that is
 *   │  far enough from the end (>= minUncompressedCount). Everything
 *   │  before it is discarded.
 *   │
 *   ▼  Step 2 — Forward pass: convert each UI message to model messages
 *   │  For each message from boundary → end:
 *   │  • User messages: merge env-context + content into one message
 *   │  • Assistant messages: convert, then add synthetic user message
 *   │    after it for env-changes (if any)
 *   │
 *   ▼  Step 3 — Cache control breakpoints (4 points)
 *   │
 *   ▼  ModelMessage[]
 * ```
 *
 * ## Metadata handling by message role
 *
 * When a message carries metadata (env-snapshot, env-changes, compressed
 * history, sandbox file attachments), it's surfaced as user-role content:
 *
 * **User messages** — everything merged into one message:
 * ```
 * <compressed-conversation-history>  (if present, always first)
 * <env-snapshot> or <env-changes>
 * attachments, mentions, selected elements
 * <user-msg>  (always last)
 * ```
 *
 * **Assistant messages** — synthetic user messages around the assistant:
 * ```
 * [synthetic user: <compressed-conversation-history>]  ← BEFORE
 * [assistant message]
 * [synthetic user: <env-snapshot> or <env-changes>]    ← AFTER
 * ```
 *
 * ## Environment context — single capture point
 *
 * A fresh environment snapshot is captured once, right before the
 * conversion pipeline runs (`generateContextForNewStep`), and attached
 * (sparsified) to the **last message in history** — regardless of role.
 *
 * - For **user messages**, env-changes describe what happened since the
 *   previous message. They are merged into the user message content,
 *   before the `<user-msg>` part, so the model sees the current
 *   environment alongside the user's request.
 *
 * - For **assistant messages**, env-changes describe what happened as a
 *   result of the assistant's tool calls. They are emitted as a
 *   synthetic user message *after* the assistant message, since the
 *   changes are consequences of that assistant turn.
 *
 * The first message (or first after compression) always gets a full
 * `<env-snapshot>`. Subsequent messages get `<env-changes>` only if
 * their sparse snapshot is non-empty (i.e. something actually changed).
 */
export const convertAgentMessagesToModelMessages = async (
  messages: AgentMessage[],
  systemPrompt: string,
  tools: ToolSet,
  minUncompressedCount: number,
  agentInstanceId: string,
  blobReader: BlobReader,
  modelCapabilities?: ModelCapabilities,
  onBlobError?: BlobErrorReporter,
  currentModelId?: string,
  shellInfo?: ShellInfo | null,
  skillDetails?: Map<string, SkillInfo>,
  assetCacheService?: AssetCacheService,
): Promise<ModelMessage[]> => {
  // ─── Step 1: Find compression boundary ──────────────────────────────

  const boundaryIndex = findCompressionBoundary(messages, minUncompressedCount);

  // ─── Step 2: Forward pass — convert messages to model format ────────

  const modelMessages: ModelMessage[] = [];

  if (systemPrompt) {
    modelMessages.push({ role: 'system', content: systemPrompt });
  }

  let snapshotEmitted = false;
  let cachedPreviousSnapshot: FullEnvironmentSnapshot | null =
    boundaryIndex > 0
      ? resolveEffectiveSnapshot(messages, boundaryIndex - 1)
      : null;

  for (let i = boundaryIndex; i < messages.length; i++) {
    const message = messages[i];

    const envParts = buildEnvContextParts(
      messages,
      i,
      snapshotEmitted,
      agentInstanceId,
      cachedPreviousSnapshot,
      shellInfo,
      skillDetails,
    );
    if (envParts.emittedSnapshot) snapshotEmitted = true;
    if (envParts.effectiveSnapshot) {
      cachedPreviousSnapshot = envParts.effectiveSnapshot;
    }

    const compressedPart = buildCompressedHistoryPart(
      message,
      i,
      boundaryIndex,
      minUncompressedCount,
    );

    if (message.role === 'user') {
      const userMsg = await convertUserMessage(
        message,
        agentInstanceId,
        blobReader,
        modelCapabilities,
        onBlobError,
        currentModelId,
        assetCacheService,
      );
      // convertUserMessage always returns content as an array of parts
      const content = userMsg.content as (TextPart | ImagePart | FilePart)[];

      // Merge everything into the user message:
      // compressed-history → env-context → [original content with user-msg]
      const merged: (TextPart | ImagePart | FilePart)[] = [];
      if (compressedPart) merged.push(compressedPart);
      merged.push(...(envParts.parts as (TextPart | ImagePart | FilePart)[]));
      merged.push(...content);
      modelMessages.push({ role: 'user', content: merged });
    } else {
      // For assistant messages, compressed-history (if any) goes BEFORE
      // as context about what came before this point in the conversation.
      if (compressedPart) {
        modelMessages.push({
          role: 'user',
          content: [compressedPart],
        });
      }

      const assistantMsgs = await convertAssistantMessage(message, tools);
      modelMessages.push(...assistantMsgs);

      // Env-changes and sandbox file attachments go AFTER the assistant
      // message because the snapshot captures state after this step's
      // tool calls executed. Consolidated into a single synthetic user
      // message when both are present.
      const sandboxAttachments = collectCustomFileAttachments(message);
      const hasSandboxAttachments = sandboxAttachments.length > 0;
      const hasEnvParts = envParts.parts.length > 0;

      if (hasEnvParts || hasSandboxAttachments) {
        const syntheticParts: (TextPart | ImagePart | FilePart)[] = [];
        if (hasEnvParts) {
          syntheticParts.push(
            ...(envParts.parts as (TextPart | ImagePart | FilePart)[]),
          );
        }
        if (hasSandboxAttachments) {
          const attachmentMsg = await buildSyntheticUserMessageForAttachments(
            sandboxAttachments,
            agentInstanceId,
            blobReader,
            modelCapabilities,
            onBlobError,
            currentModelId,
            assetCacheService,
          );
          const attachContent = Array.isArray(attachmentMsg.content)
            ? attachmentMsg.content
            : [{ type: 'text' as const, text: attachmentMsg.content }];
          syntheticParts.push(
            ...(attachContent as (TextPart | ImagePart | FilePart)[]),
          );
        }
        modelMessages.push({ role: 'user', content: syntheticParts });
      }
    }
  }

  // ─── Step 3: Cache control breakpoints ──────────────────────────────

  return addCacheControlBreakpoints(modelMessages);
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: find compression boundary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan backward from the end to find the compression boundary — the last
 * message with `compressedHistory` that is at least `minUncompressedCount`
 * messages before the end. Returns its index, or 0 if none found.
 */
function findCompressionBoundary(
  messages: AgentMessage[],
  minUncompressedCount: number,
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const reverseMsgCount = messages.length - i;
    if (
      minUncompressedCount <= reverseMsgCount &&
      messages[i].metadata?.compressedHistory !== undefined
    ) {
      return i;
    }
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build env-context parts for a message
// ─────────────────────────────────────────────────────────────────────────────

interface EnvContextResult {
  parts: UserContent;
  emittedSnapshot: boolean;
  effectiveSnapshot: FullEnvironmentSnapshot | null;
}

/**
 * Compute the environment context parts for the message at `msgIndex`.
 *
 * If `snapshotEmitted` is false, this is the first message that needs
 * env context → produce a full `<env-snapshot>`. Otherwise, compute
 * `<env-changes>` from the previous message's effective snapshot.
 *
 * Accepts a cached `previousEffective` to avoid redundant backward walks.
 * Returns the current effective snapshot for caching in the next iteration.
 */
function buildEnvContextParts(
  messages: AgentMessage[],
  msgIndex: number,
  snapshotEmitted: boolean,
  agentInstanceId: string,
  previousEffective: FullEnvironmentSnapshot | null,
  shellInfo?: ShellInfo | null,
  skillDetails?: Map<string, SkillInfo>,
): EnvContextResult {
  const parts: UserContent = [];
  const current = resolveEffectiveSnapshot(messages, msgIndex);

  if (!snapshotEmitted) {
    if (current) {
      parts.push({
        type: 'text',
        text: renderFullEnvironmentContext(current, shellInfo, skillDetails),
      });
      return { parts, emittedSnapshot: true, effectiveSnapshot: current };
    }
  } else if (msgIndex > 0 && current && previousEffective) {
    const changes = computeAllEnvironmentChanges(
      previousEffective,
      current,
      agentInstanceId,
    );
    if (changes.length > 0) {
      parts.push({
        type: 'text',
        text: renderEnvironmentChangesXml(changes),
      });
    }
  }

  return { parts, emittedSnapshot: false, effectiveSnapshot: current };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build compressed-history part
// ─────────────────────────────────────────────────────────────────────────────

/**
 * If this message is at the compression boundary and has compressed
 * history, return a text content part with the XML-wrapped history.
 */
function buildCompressedHistoryPart(
  message: AgentMessage,
  msgIndex: number,
  boundaryIndex: number,
  minUncompressedCount: number,
): { type: 'text'; text: string } | null {
  if (msgIndex !== boundaryIndex) return null;
  if (minUncompressedCount <= 0) return null;
  const history = message.metadata?.compressedHistory;
  if (!history) return null;
  return {
    type: 'text',
    text: xml({
      'compressed-conversation-history': { _cdata: history },
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: convert assistant message
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an assistant UI message into model messages.
 * Returns only the assistant-role message(s). Sandbox file attachments
 * are handled by the main loop alongside env-changes.
 */
async function convertAssistantMessage(
  message: AgentMessage,
  tools: ToolSet,
): Promise<ModelMessage[]> {
  const cleanedMessage = {
    ...message,
    parts: message.parts.map((part) => {
      if (
        (part.type.startsWith('tool-') || part.type === 'dynamic-tool') &&
        'output' in part &&
        part.output &&
        typeof part.output === 'object'
      ) {
        return {
          ...part,
          output: stripUnderscoreProperties(
            part.output as Record<string, unknown>,
          ),
        };
      }
      return part;
    }),
  };

  return convertToModelMessages([cleanedMessage], { tools });
}

/**
 * Convert a user UI message into a single `UserModelMessage`.
 * Wraps user text in `<user-msg>`, converts file attachments, mentions,
 * selected elements, and text clips into content parts.
 */
async function convertUserMessage(
  message: AgentMessage,
  agentInstanceId: string,
  blobReader: BlobReader,
  modelCapabilities?: ModelCapabilities,
  onBlobError?: BlobErrorReporter,
  currentModelId?: string,
  assetCacheService?: AssetCacheService,
): Promise<UserModelMessage> {
  const parts = message.parts.map((part) => {
    if (part.type === 'text')
      return {
        ...part,
        text: xml({ 'user-msg': { _cdata: part.text } }),
      };
    return { ...part };
  });

  // File parts that carry raw buffer data cannot go through convertToModelMessages
  // because FileUIPart only accepts url: string (http/https). We collect them
  // separately and splice them directly into converted.content as FilePart/ImagePart objects.
  const directParts: (FilePart | ImagePart)[] = [];

  if ((message.metadata?.fileAttachments?.length || 0) > 0) {
    for (const f of message.metadata!.fileAttachments!) {
      const check = canModelConsumeAttachment(
        modelCapabilities,
        f.mediaType,
        f.sizeBytes,
        currentModelId,
      );
      const hint = check.canConsume
        ? 'User-attached file. See next part for inline content.'
        : `${check.reason} Access via fs.readFile('att/${f.id}') in the sandbox.`;

      parts.push({
        type: 'text',
        text: xml({
          [specialTokens.userMsgAttachmentXmlTag]: {
            _attr: {
              type: 'file',
              filename: f.fileName,
              id: f.id,
              hint,
            },
          },
        }),
      });

      if (check.canConsume) {
        try {
          const filePath = getBlobPath(agentInstanceId, f.id);
          const result = await assetCacheService?.resolve(
            filePath,
            f.mediaType,
            f.fileName,
          );
          if (result?.type === 'url') {
            if (isImageMime(f.mediaType)) {
              // Images with URLs bypass convertToModelMessages entirely
              // so the SDK passes the URL through to the provider as-is
              // instead of downloading and base64-encoding the content.
              directParts.push({
                type: 'image',
                image: new URL(result.url),
                mediaType: f.mediaType,
              } satisfies ImagePart);
            } else {
              // Non-image presigned URL: FileUIPart goes through convertToModelMessages.
              parts.push({
                type: 'file',
                url: result.url,
                mediaType: f.mediaType,
                filename: f.fileName,
              } as unknown as (typeof parts)[number]);
            }
          } else {
            const buf =
              result?.buffer ?? (await blobReader(agentInstanceId, f.id));
            if (isImageMime(f.mediaType)) {
              directParts.push({
                type: 'image',
                image: new Uint8Array(buf),
                mediaType: f.mediaType,
              } satisfies ImagePart);
            } else {
              directParts.push({
                type: 'file',
                data: new Uint8Array(buf),
                mediaType: f.mediaType,
                filename: f.fileName,
              });
            }
          }
        } catch (err) {
          onBlobError?.(err, {
            operation: 'readAttachmentBlob',
            attachmentId: f.id,
          });
        }
      }
    }
  }

  const converted = (
    await convertToModelMessages([{ ...message, parts }])
  )[0]! as UserModelMessage;

  if (typeof converted.content === 'string') {
    converted.content = [{ type: 'text', text: converted.content }];
  }

  // Splice buffer-backed file/image parts directly into the model-level content.
  if (directParts.length > 0) {
    const existing: (TextPart | ImagePart | FilePart)[] =
      typeof converted.content === 'string'
        ? [{ type: 'text', text: converted.content }]
        : (converted.content as (TextPart | ImagePart | FilePart)[]);
    converted.content = [...existing, ...directParts];
  }

  const attachmentParts: string[] = [];

  if (
    message.metadata?.textClipAttachments &&
    message.metadata.textClipAttachments.length > 0
  )
    message.metadata.textClipAttachments.forEach((textClip) => {
      attachmentParts.push(textClipToContextSnippet(textClip));
    });

  if (message.metadata?.mentions && message.metadata.mentions.length > 0)
    message.metadata.mentions.forEach((mention) => {
      attachmentParts.push(mentionToContextSnippet(mention));
    });

  if (
    message.metadata?.selectedPreviewElements &&
    message.metadata.selectedPreviewElements.length > 0
  ) {
    message.metadata.selectedPreviewElements.slice(0, 5).forEach((element) => {
      attachmentParts.push(
        selectedElementToContextSnippet(element as SelectedElement),
      );
    });

    attachmentParts.push(
      relevantCodebaseFilesToContextSnippet(
        (message.metadata?.selectedPreviewElements ?? []) as SelectedElement[],
        6,
      ),
    );
  }

  if (attachmentParts.length > 0) {
    (converted.content as (TextPart | ImagePart | FilePart)[]).push({
      type: 'text',
      text: attachmentParts.join('\n'),
    });
  }

  return { role: 'user', content: converted.content };
}

/**
 * Cache-control provider options for native SDK providers.
 * Each SDK reads only its own key on message-level providerOptions.
 *
 * The `openaiCompatible` key is hardcoded in the SDK's message converter
 * (`getOpenAIMetadata`) and spread directly onto each message in the
 * request body — it does NOT use the custom provider name. This is how
 * `cache_control` reaches the stagewise gateway without any extra
 * transform logic.
 */
const CACHE_CONTROL_PROVIDER_OPTIONS = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
  openaiCompatible: { cache_control: { type: 'ephemeral' } },
} satisfies Record<string, unknown>;

/**
 * Annotates up to 3 messages with cache control breakpoints:
 *
 * 1. The **first system message** — 100% static, always a cache hit.
 * 2. The **last assistant message before the last user message** — caches
 *    the conversation history up to the most recent exchange.
 * 3. The **last message overall** — ensures the tail of the conversation
 *    (which changes every turn) is marked for write-caching.
 *
 * If any of these indices overlap (e.g. only 1 message), duplicates are
 * deduplicated so each message is annotated at most once.
 *
 * Non-Anthropic providers ignore unknown `providerOptions` keys, so this is
 * safe to apply unconditionally.
 */
function addCacheControlBreakpoints(messages: ModelMessage[]): ModelMessage[] {
  if (messages.length === 0) return messages;

  const indicesToCache = new Set<number>();

  // 1. First system message
  const firstSystemIndex = messages.findIndex((m) => m.role === 'system');
  if (firstSystemIndex !== -1) indicesToCache.add(firstSystemIndex);

  // 2. Last assistant message before the last user message
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx > 0) {
    for (let i = lastUserIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        indicesToCache.add(i);
        break;
      }
    }
  }

  // 3. Last message overall
  indicesToCache.add(messages.length - 1);

  // Apply cache control to selected messages (mutate-free)
  return messages.map((message, idx) => {
    if (!indicesToCache.has(idx)) return message;
    return {
      ...message,
      providerOptions: deepMergeProviderOptions(
        CACHE_CONTROL_PROVIDER_OPTIONS,
        message.providerOptions,
      ),
    };
  });
}

export const capitalizeFirstLetter = (string: string): string => {
  return string.charAt(0).toUpperCase() + string.slice(1);
};
