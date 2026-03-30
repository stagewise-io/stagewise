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
import type { SkillDefinition } from '@shared/skills';
import type {
  FullEnvironmentSnapshot,
  TabMentionMeta,
} from '@shared/karton-contracts/ui/agent/metadata';

import {
  computeAllEnvironmentChanges,
  renderEnvironmentChangesXml,
  resolveEffectiveSnapshot,
} from '../prompts/utils/environment-changes';
import {
  renderFullEnvironmentContext,
  type ShellInfo,
} from '../prompts/utils/environment-renderer';
import type { SkillInfo } from '../prompts/utils/skills';
import { deepMergeProviderOptions } from '@/agents/model-provider';
import {
  extractSlashIdsFromText,
  inlineSlashLinksAsText,
  resolveSlashSkill,
  renderSlashCommandXml,
} from '../prompts/utils/metadata-converter/slash-items';
import { tabMentionToContextSnippet } from '../prompts/utils/metadata-converter/mentions';
import xml from 'xml';
import type { ModelCapabilities } from '@shared/karton-contracts/ui/shared-types';
import type { Logger } from '@/services/logger';
import type { FileReadCacheService } from '@/services/file-read-cache';
import type { ProcessedImageCacheService } from '@/services/processed-image-cache';
import {
  fileReadTransformer,
  type ReadParams,
  SeenFilesTracker,
} from './file-read-transformer';
import {
  extractReadFileRequestsFromAssistantMessage,
  type ReadFileRequest,
} from './file-read-transformer/path-references';
import { processImageForModel } from './image-processor';

/**
 * Reads a file by its full mount-prefixed path.
 * Supported prefixes:
 *   - `att/<key>` — agent data-attachment blob
 *   - `w{prefix}/<relative>` — file inside an open workspace mount
 *
 * The reader is responsible for resolving paths to bytes; callers pass
 * paths as-is without pre-stripping any prefix.
 */
export type BlobReader = (agentId: string, path: string) => Promise<Buffer>;

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
 * Converts UI messages to model messages for LLM consumption.
 *
 * ## High-level pipeline
 *
 * ```
 * UI Messages (AgentMessage[])
 *   │
 *   ▼  Step 1 — Find compression boundary
 *   │  Scan backward for the last message with compressedHistory.
 *   │  Everything before it is discarded.
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
 * <memory>  (if present, always first)
 * <env-snapshot> or <env-changes>
 * attachments, mentions, selected elements
 * <user-msg>  (always last)
 * ```
 *
 * **Assistant messages** — synthetic user messages around the assistant:
 * ```
 * [synthetic user: <memory>]  ← BEFORE
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
  agentInstanceId: string,
  blobReader: BlobReader,
  modelCapabilities?: ModelCapabilities,
  shellInfo?: ShellInfo | null,
  skillDetails?: Map<string, SkillInfo>,
  logger?: Logger,
  imageCache?: ProcessedImageCacheService,
  skills?: ReadonlyArray<SkillDefinition>,
  fileReadCache?: FileReadCacheService,
  mountPaths?: Map<string, string>,
): Promise<ModelMessage[]> => {
  // ─── Step 1: Find compression boundary ──────────────────────────────

  const boundaryIndex = findCompressionBoundary(messages);

  // ─── Step 2: Forward pass — convert messages to model format ────────

  const modelMessages: ModelMessage[] = [];

  // Tracks which (path, hash) pairs have been injected into the context
  // this conversation window. Used to deduplicate user mentions and
  // sandbox attachments — agent readFile calls bypass this check entirely
  // and are always injected.
  const seenFiles = new SeenFilesTracker();

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
    );

    if (message.role === 'user') {
      const userMsg = await convertUserMessage(
        message,
        agentInstanceId,
        logger,
        imageCache,
        skills,
      );
      // convertUserMessage always returns content as an array of parts
      const content = userMsg.content as (TextPart | ImagePart | FilePart)[];

      // Inject file contents from pathReferences (before user-msg content).
      // User-mentioned files default to preview mode — full content is
      // loaded only when the agent explicitly calls the readFile tool.
      const rawFileParts = await injectFileReferences(
        message.metadata?.pathReferences,
        seenFiles,
        agentInstanceId,
        blobReader,
        fileReadCache,
        mountPaths,
        logger,
        { preview: true },
      );
      // Adapt images to the current model's constraints (resize/compress).
      const fileParts = await adaptImagePartsForModel(
        rawFileParts,
        modelCapabilities,
        logger,
        imageCache,
      );

      // compressed-history → env-context → file-refs → [original content with user-msg]
      const merged: (TextPart | ImagePart | FilePart)[] = [];
      if (compressedPart) merged.push(compressedPart);
      merged.push(...(envParts.parts as (TextPart | ImagePart | FilePart)[]));
      merged.push(...fileParts);
      merged.push(...content);
      modelMessages.push({ role: 'user', content: merged });
    } else {
      // For assistant boundary messages, emit the compressed history as
      // a standalone user message before the assistant reply. This
      // naturally alternates roles (user → assistant) without needing
      // a synthetic ack.
      if (compressedPart) {
        modelMessages.push({
          role: 'user',
          content: [compressedPart],
        });
      }

      const assistantMsgs = await convertAssistantMessage(message, tools);
      modelMessages.push(...assistantMsgs);

      // Inject file contents from pathReferences (from readFile tool calls).
      // Extract per-call read params (start_line, end_line, etc.) from the
      // tool-call parts so that line/page ranges are correctly forwarded
      // to the transformer pipeline.
      const readFileRequests =
        extractReadFileRequestsFromAssistantMessage(message);
      const rawFileParts = await injectFileReferences(
        message.metadata?.pathReferences,
        seenFiles,
        agentInstanceId,
        blobReader,
        fileReadCache,
        mountPaths,
        logger,
        undefined,
        readFileRequests,
      );
      // Adapt images to the current model's constraints (resize/compress).
      const fileParts = await adaptImagePartsForModel(
        rawFileParts,
        modelCapabilities,
        logger,
        imageCache,
      );

      // Build a single synthetic user message after the assistant turn for:
      // 1. Env-changes (state after this step's tool calls)
      // 2. File contents from readFile pathReferences
      // All are consolidated to avoid unnecessary turn boundaries.
      const syntheticParts = [
        ...(envParts.parts as (TextPart | ImagePart | FilePart)[]),
        ...fileParts,
      ];
      if (syntheticParts.length > 0) {
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
 * message with `compressedHistory`. Returns its index, or 0 if none found.
 *
 * The boundary placement is fully controlled by `compressHistoryInternal`
 * which uses a token-budget-aware algorithm. This reader simply trusts
 * wherever the boundary was placed.
 */
function findCompressionBoundary(messages: AgentMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].metadata?.compressedHistory !== undefined) {
      return i;
    }
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: inject file contents from pathReferences
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process `pathReferences` on a message and return model-ready content parts
 * for each file that hasn't been seen yet in this conversation window.
 *
 * Deduplication: a `(path, hash)` pair is only injected once. If the same
 * path appears later with a *different* hash, the file is re-injected with
 * updated content.
 *
 * When `readFileRequests` is provided (assistant-side references from
 * readFile tool calls), each tool call's read params (start_line, end_line,
 * etc.) are forwarded to the transformer so that line/page-range slicing
 * works correctly. This also handles the case where the same file is read
 * multiple times with different ranges in the same assistant turn.
 *
 * Gracefully no-ops when `fileReadCache` or `mountPaths` are not provided
 * (the feature is disabled) or when `pathReferences` is empty/undefined.
 */
/**
 * Resolve the effective `ReadParams` for a referenced path.
 *
 * Heuristics (in priority order):
 *
 * 1. **User-uploaded attachments** (`att/` prefix) — always loaded in full.
 *    Attachments are explicit user-provided context; truncating them would
 *    lose intent. No `preview` flag, no line/page range.
 *
 * 2. **Workspace files mentioned by the user** — loaded in `preview` mode
 *    by default (the caller passes `{ preview: true }` as
 *    `defaultReadParams`). The agent can later request the full content
 *    via the `readFile` tool.
 *
 * 3. **Files from assistant tool-calls** (readFile results) — read params
 *    are extracted from the tool-call parts via `readFileRequests`.
 */
function resolveReadParams(
  path: string,
  defaultReadParams?: ReadParams,
): ReadParams | undefined {
  // Attachments are always full — override any caller default.
  if (path.startsWith('att/')) return undefined;
  return defaultReadParams;
}

async function injectFileReferences(
  pathReferences: Record<string, string> | undefined,
  seenFiles: SeenFilesTracker,
  agentInstanceId: string,
  blobReader: BlobReader,
  fileReadCache?: FileReadCacheService,
  mountPaths?: Map<string, string>,
  logger?: Logger,
  defaultReadParams?: ReadParams,
  readFileRequests?: ReadFileRequest[],
): Promise<(TextPart | ImagePart | FilePart)[]> {
  if (!pathReferences || !fileReadCache || !mountPaths || !logger) return [];

  const allParts: (TextPart | ImagePart | FilePart)[] = [];

  // When per-call read params are available (assistant-side references),
  // iterate the individual tool-call requests so that each call's
  // start_line/end_line/etc. is correctly forwarded to the transformer.
  // This also handles the case where the same file is read multiple
  // times with different ranges in the same assistant turn.
  if (readFileRequests && readFileRequests.length > 0) {
    for (const { path, readParams } of readFileRequests) {
      const hash = pathReferences[path];
      if (!hash) continue;

      // Attachments are always full — ignore tool-call params.
      const requestedParams = path.startsWith('att/') ? {} : readParams;

      // Agent readFile calls are always injected — no dedup check.
      // The agent decides what to re-read. FileReadCacheService still
      // caches transformations so repeated identical reads are cheap.
      try {
        const result = await fileReadTransformer({
          mountedPath: path,
          expectedHash: hash,
          blobReader,
          cache: fileReadCache,
          logger,
          agentId: agentInstanceId,
          mountPaths,
          readParams: requestedParams,
        });

        // Still record so user-mention dedup stays aware of injected files.
        seenFiles.record(path, hash);

        allParts.push(...result.parts);
      } catch (err) {
        logger?.warn(`[injectFileReferences] Failed to transform ${path}`, err);
        allParts.push({
          type: 'text',
          text:
            `<file path="${path}">\n` +
            '<metadata>error:true</metadata>\n' +
            '<content>\n' +
            `File could not be loaded: ${err instanceof Error ? err.message : String(err)}` +
            '\n</content>\n</file>',
        });
      }
    }

    // Also inject any pathReferences entries that did NOT come from
    // tool-read calls (e.g. sandbox-created attachments). These don't
    // have per-call read params and use the default (full content).
    const toolReadPaths = new Set(readFileRequests.map((r) => r.path));
    for (const [path, hash] of Object.entries(pathReferences)) {
      if (toolReadPaths.has(path)) continue;

      const requestedParams = resolveReadParams(path, defaultReadParams) ?? {};

      if (seenFiles.isCovered(path, hash)) continue;

      try {
        const result = await fileReadTransformer({
          mountedPath: path,
          expectedHash: hash,
          blobReader,
          cache: fileReadCache,
          logger,
          agentId: agentInstanceId,
          mountPaths,
          readParams: requestedParams,
        });

        seenFiles.record(path, hash);

        allParts.push(...result.parts);
      } catch (err) {
        logger?.warn(`[injectFileReferences] Failed to transform ${path}`, err);
        allParts.push({
          type: 'text',
          text:
            `<file path="${path}">\n` +
            '<metadata>error:true</metadata>\n' +
            '<content>\n' +
            `File could not be loaded: ${err instanceof Error ? err.message : String(err)}` +
            '\n</content>\n</file>',
        });
      }
    }

    return allParts;
  }

  // Fallback: no per-call requests — iterate pathReferences entries
  // with the default read params (used for user-side references).
  const entries = Object.entries(pathReferences);
  if (entries.length === 0) return [];

  for (const [path, hash] of entries) {
    const requestedParams = resolveReadParams(path, defaultReadParams) ?? {};

    // Dedup: skip if this (path, hash) was already injected this window.
    if (seenFiles.isCovered(path, hash)) continue;

    try {
      const result = await fileReadTransformer({
        mountedPath: path,
        expectedHash: hash,
        blobReader,
        cache: fileReadCache,
        logger,
        agentId: agentInstanceId,
        mountPaths,
        readParams: requestedParams,
      });

      seenFiles.record(path, hash);

      allParts.push(...result.parts);
    } catch (err) {
      logger?.warn(`[injectFileReferences] Failed to transform ${path}`, err);
      // On failure, emit an error placeholder so the model knows the
      // file was referenced but couldn't be loaded.
      allParts.push({
        type: 'text',
        text:
          `<file path="${path}">\n` +
          '<metadata>error:true</metadata>\n' +
          '<content>\n' +
          `File could not be loaded: ${err instanceof Error ? err.message : String(err)}` +
          '\n</content>\n</file>',
      });
    }
  }

  return allParts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: per-model image post-processing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Post-process `ImagePart`s to fit the active model's constraints.
 *
 * ## Two-pass design
 *
 * The file attachment pipeline is intentionally split into two passes:
 *
 * 1. **Transform pass** (`fileReadTransformer` / `imageTransformer`):
 *    Produces a model-agnostic, compact representation (WebP q80).
 *    This result is cached by content hash so it can be reused across
 *    models and steps without re-reading the file.
 *
 * 2. **Adapt pass** (this function):
 *    Runs *after* caching, applying model-specific constraints
 *    (max bytes, max dimensions, supported MIME types) via
 *    `processImageForModel`. This pass is NOT cached because the
 *    constraints vary per model.
 *
 * This separation means image data may be re-encoded twice (once in
 * the transformer, once here), but it ensures the cache remains
 * model-independent while still respecting each model's limits.
 * Currently only images require adaptation; other modalities (text,
 * PDF, directory listings) pass through unchanged.
 *
 * Non-image parts are passed through unchanged. If processing fails
 * for an image, it is replaced with a text fallback.
 *
 * Mutates nothing — returns a new array.
 */
async function adaptImagePartsForModel(
  parts: (TextPart | ImagePart | FilePart)[],
  modelCapabilities?: ModelCapabilities,
  logger?: Logger,
  imageCache?: ProcessedImageCacheService,
): Promise<(TextPart | ImagePart | FilePart)[]> {
  // If the model doesn't accept image input at all, strip all ImageParts
  // and replace with a text fallback.
  if (modelCapabilities && !modelCapabilities.inputModalities?.image) {
    return parts.map((part) =>
      part.type === 'image'
        ? ({
            type: 'text',
            text: '[Image content not available to this model]',
          } satisfies TextPart)
        : part,
    );
  }

  const imageConstraint = modelCapabilities?.inputConstraints?.image;
  if (!imageConstraint) return parts;

  const result: (TextPart | ImagePart | FilePart)[] = [];

  for (const part of parts) {
    if (part.type !== 'image') {
      result.push(part);
      continue;
    }

    // Convert image data back to Buffer for processImageForModel.
    // ImagePart.image is `DataContent | URL` where DataContent =
    // string (base64) | Uint8Array | ArrayBuffer | Buffer.
    // The file-read pipeline always produces Uint8Array, but handle
    // all cases defensively. Skip URL-based images.
    if (part.image instanceof URL) {
      result.push(part);
      continue;
    }
    let buf: Buffer;
    if (typeof part.image === 'string') {
      // Base64-encoded image data.
      buf = Buffer.from(part.image, 'base64');
    } else if (part.image instanceof ArrayBuffer) {
      buf = Buffer.from(new Uint8Array(part.image));
    } else {
      buf = Buffer.from(part.image);
    }
    const mediaType = (part.mediaType as string) ?? 'image/webp';

    const processed = await processImageForModel(
      buf,
      mediaType,
      imageConstraint,
      logger,
      imageCache,
    );

    if (processed.ok) {
      result.push({
        type: 'image',
        image: new Uint8Array(processed.buf),
        mediaType: processed.mediaType,
      } satisfies ImagePart);
    } else {
      // Processing failed — replace with a text fallback so the model
      // knows an image was here but couldn't be delivered.
      const reason =
        processed.error instanceof Error
          ? processed.error.message
          : 'Image processing failed.';
      logger?.warn(
        `[adaptImagePartsForModel] Image could not be adapted: ${reason}`,
      );
      result.push({
        type: 'text',
        text: `[Image could not be processed for this model: ${reason}]`,
      });
    }
  }

  return result;
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
): { type: 'text'; text: string } | null {
  if (msgIndex !== boundaryIndex) return null;
  const history = message.metadata?.compressedHistory;
  if (!history) return null;
  return {
    type: 'text',
    text: xml({
      memory: { _cdata: history },
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
      const isToolPart =
        part.type.startsWith('tool-') || part.type === 'dynamic-tool';
      if (!isToolPart) return part;

      let cleaned = { ...part };

      // Sanitize tool input: providers reject non-object input in
      // tool-call content blocks (e.g. raw strings from failed
      // repair). Replace with empty object so the conversation
      // stays recoverable — the tool result/error already carries
      // enough context for the LLM.
      if (
        'input' in cleaned &&
        (typeof cleaned.input !== 'object' ||
          cleaned.input === null ||
          Array.isArray(cleaned.input))
      )
        cleaned = { ...cleaned, input: {} } as typeof cleaned;

      // Strip internal underscore properties from tool output.
      if (
        'output' in cleaned &&
        cleaned.output &&
        typeof cleaned.output === 'object'
      ) {
        cleaned = {
          ...cleaned,
          output: stripUnderscoreProperties(
            cleaned.output as Record<string, unknown>,
          ),
        } as typeof cleaned;
      }

      return cleaned;
    }),
  };

  return convertToModelMessages([cleanedMessage], { tools });
}

/**
 * Convert a user UI message into a single `UserModelMessage`.
 *
 * Wraps user text in `<user-msg>`. File attachments and file/workspace
 * mentions are handled by the `pathReferences` pipeline; only tab
 * mentions are still rendered here.
 */
async function convertUserMessage(
  message: AgentMessage,
  _agentInstanceId: string,
  _logger?: Logger,
  _imageCache?: ProcessedImageCacheService,
  skills?: ReadonlyArray<SkillDefinition>,
): Promise<UserModelMessage> {
  // ── Resolve slash-invoked skills ────────────────────────────────────
  // Extract slash skill IDs from the raw text, resolve their content
  // from disk, and replace `[label](slash:id)` links with the
  // human-readable label (e.g. `/plan`). Resolved content is prepended
  // as XML-wrapped parts *before* the <user-msg> so the LLM reads the
  // instruction first.
  const slashIds = extractSlashIdsFromText(message.parts);
  const slashContentParts: TextPart[] = [];
  for (const id of slashIds) {
    const cmd = await resolveSlashSkill(id, skills ?? []);
    if (cmd)
      slashContentParts.push({
        type: 'text',
        text: renderSlashCommandXml(cmd),
      });
  }

  const parts = message.parts.map((part) => {
    if (part.type === 'text') {
      // Replace slash links with the human-readable label so the
      // command invocation stays visible in <user-msg>.
      const cleaned = inlineSlashLinksAsText(part.text ?? '');
      return {
        ...part,
        text: xml({ 'user-msg': { _cdata: cleaned } }),
      };
    }
    return { ...part };
  });

  const converted = (
    await convertToModelMessages([{ ...message, parts }])
  )[0]! as UserModelMessage;

  if (typeof converted.content === 'string') {
    converted.content = [{ type: 'text', text: converted.content }];
  }

  // Prepend resolved slash-command content before the user-msg parts
  // so the LLM reads the instruction context first.
  if (slashContentParts.length > 0) {
    converted.content = [
      ...slashContentParts,
      ...(converted.content as (TextPart | ImagePart | FilePart)[]),
    ];
  }

  // Only tab mentions are rendered here — file and workspace mentions
  // are now handled by the pathReferences pipeline.
  const tabMentionParts: string[] = [];
  if (message.metadata?.mentions && message.metadata.mentions.length > 0) {
    for (const mention of message.metadata.mentions) {
      if (mention.providerType === 'tab') {
        tabMentionParts.push(
          tabMentionToContextSnippet(mention as TabMentionMeta),
        );
      }
    }
  }

  if (tabMentionParts.length > 0) {
    (converted.content as (TextPart | ImagePart | FilePart)[]).push({
      type: 'text',
      text: tabMentionParts.join('\n'),
    });
  }

  // Cap total text to prevent blowing the context window with massive
  // pastes, text clips, or selected-element HTML.
  capUserMessageTextParts(
    converted.content as (TextPart | ImagePart | FilePart)[],
  );

  return { role: 'user', content: converted.content };
}

/**
 * Prevents a single user message from exceeding a reasonable text
 * budget. Large text parts (pastes, text clips, selected-element HTML)
 * are truncated largest-first until the total is within budget.
 *
 * Uses a sandwich strategy: keeps the beginning and end of each part
 * (where the most important context typically lives) and removes from
 * the middle.
 *
 * Mutates `parts` in place.
 */
const USER_MSG_TEXT_BUDGET_CHARS = 200_000; // ~50k tokens
const TRUNCATION_MARKER =
  '\n\n... [middle of content truncated \u2014 original exceeded size limit] ...\n\n';

function capUserMessageTextParts(
  parts: (TextPart | ImagePart | FilePart)[],
): void {
  let totalChars = 0;
  for (const p of parts) if (p.type === 'text') totalChars += p.text.length;

  if (totalChars <= USER_MSG_TEXT_BUDGET_CHARS) return;

  // Collect text parts with their indices, sort largest-first
  const textEntries = parts
    .map((p, i) => ({ part: p, index: i }))
    .filter(
      (e): e is { part: TextPart; index: number } => e.part.type === 'text',
    )
    .sort((a, b) => b.part.text.length - a.part.text.length);

  let excess = totalChars - USER_MSG_TEXT_BUDGET_CHARS;

  for (const entry of textEntries) {
    if (excess <= 0) break;

    const text = entry.part.text;
    const keepChars = 200; // chars to preserve on each side
    const maxCut = text.length - keepChars * 2;
    if (maxCut <= 0) continue;

    // Ensure we remove at least enough to offset the inserted marker
    const minCut = TRUNCATION_MARKER.length;
    const cut = Math.min(Math.max(excess + minCut, minCut), maxCut);
    const headEnd = Math.ceil((text.length - cut) / 2);
    const tailStart = text.length - Math.floor((text.length - cut) / 2);
    entry.part.text =
      text.slice(0, headEnd) + TRUNCATION_MARKER + text.slice(tailStart);
    // Net reduction: chars removed minus marker inserted
    excess -= cut - TRUNCATION_MARKER.length;
  }
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
