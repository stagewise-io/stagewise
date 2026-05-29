import {
  type ModelMessage,
  convertToModelMessages,
  type UserModelMessage,
  type ToolSet,
  type UserContent,
  type TextPart,
  type ImagePart,
  type FilePart,
  type UITools,
} from 'ai';
import xml from 'xml';

import type { AgentMessage } from '../../types/agent';
import type { ModelCapabilities } from '../../types/models';
import type { SkillDefinition } from '../../types/skills';
import type {
  ReasoningSignatureSource,
  UserMessageMetadata,
} from '../../types/metadata';
import { reasoningSourcesMatch } from './reasoning-signatures';
import type { DomainAdapterRegistry, DomainId } from '../../env/contract';
import { resolveEffectiveEnvStateEntries } from '../../env/contract';
import type { Logger } from '../../host/logger';
import type { HostPaths } from '../../host/paths';
import type { FileReadCacheService } from '../../services/file-read-cache';
import type { FileTransformer } from '../../file-read-transformer/types';
import {
  type ProcessedImageCacheService,
  processImageForModel,
} from '../../services/processed-image-cache';
import {
  fileReadTransformer,
  type ReadParams,
  SeenFilesTracker,
  extractReadFileRequestsFromAssistantMessage,
  type ReadFileRequest,
} from '../../file-read-transformer';

import {
  extractSlashIdsFromText,
  inlineSlashLinksAsText,
  resolveSlashSkill,
  renderSlashCommandXml,
} from './metadata-converter/slash-items';
import { deepMergeProviderOptions } from './provider-options';

/** Per-request content limits threaded through the pipeline. */
export interface ContentLimits {
  maxReadChars: number;
  maxPreviewLines: number;
}

/**
 * Reads a file by its full mount-prefixed path.
 *
 * Supported prefixes:
 *   - `att/<key>` — agent data-attachment blob
 *   - `w{prefix}/<relative>` — file inside an open workspace mount
 *
 * The reader is responsible for resolving paths to bytes; callers pass
 * paths as-is without pre-stripping any prefix.
 */
export type BlobReader = (agentId: string, path: string) => Promise<Buffer>;

/**
 * Render extra (host-specific) mention metadata into an inline XML
 * snippet that will be appended to the user message content.
 *
 * Core only knows about `file` and `workspace` mentions, both of which
 * are handled by the `pathReferences` pipeline. Host-only mention kinds
 * (e.g. browser tab mentions) are surfaced through this callback and
 * remain owned by the host.
 *
 * Return `null` to skip a mention.
 */
export type ExtraMentionRenderer = (mention: {
  providerType: string;
  [key: string]: unknown;
}) => string | null;

/**
 * Widened metadata shape accepted by `convertAgentMessagesToModelMessages`.
 *
 * Hosts may define richer `mentions[]` element types (e.g. browser tab
 * mentions) than the core `MentionMeta` discriminated union. The
 * conversion pipeline only needs `providerType` to dispatch and treats
 * everything else opaquely.
 */
export type ConvertibleMessageMetadata = UserMessageMetadata<{
  providerType: string;
}>;

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
 * Options bag for {@link convertAgentMessagesToModelMessages}.
 *
 * `host` is the only mandatory dependency — every other field is either
 * a feature flag or a host capability that the conversion pipeline
 * gracefully no-ops on when missing.
 */
export interface ConvertAgentMessagesOptions {
  /** Host path resolver, threaded into the file-read transformer. */
  host: HostPaths;
  /** Reads attachment / workspace bytes by mount-prefixed path. */
  blobReader: BlobReader;
  /** Active model capabilities (image limits, accepted modalities). */
  modelCapabilities?: ModelCapabilities;
  /** Logger for warnings on transformer / image processing failures. */
  logger?: Logger;
  /** Cache for the model-agnostic image transform pass. */
  imageCache?: ProcessedImageCacheService;
  /** Resolved skills used by `/slash` invocations. */
  skills?: ReadonlyArray<SkillDefinition>;
  /** Cache for transformed file content (text, image, PDF, dir). */
  fileReadCache?: FileReadCacheService;
  /** `prefix → absolute path` map for mount-prefix resolution. */
  mountPaths?: Map<string, string>;
  /** Read/preview budget overrides forwarded to the transformer. */
  contentLimits?: ContentLimits;
  /**
   * Semantic owner of the outbound step's model route. When provided,
   * assistant messages replay only the signed `reasoning_details` groups
   * whose captured source matches (see {@link reasoningSourcesMatch}), so
   * provider signatures are never sent across provider boundaries.
   */
  reasoningSignatureSource?: ReasoningSignatureSource;
  /**
   * Optional host-supplied transformers keyed by lowercased file
   * extension. Forwarded into every `fileReadTransformer()` call so
   * host-specific blob types (e.g. `.textclip`) get rendered through
   * the host's registered transformer. Sourced from
   * `AgentHost.fileReadTransformers` at the host's call site.
   */
  fileReadTransformers?: Readonly<Record<string, FileTransformer>>;
  /**
   * Render host-only mentions (e.g. tab mentions). Receives every
   * mention whose `providerType` is not handled by the core pipeline
   * (`file`, `workspace`); return `null` to skip.
   */
  renderExtraMention?: ExtraMentionRenderer;
  /**
   * Registry of registered {@link DomainAdapter}s. Used solely to
   * resolve the stable render order of per-domain env-context blocks
   * (full-state keyframe and per-turn diff). When omitted, domains are
   * emitted in insertion order of the message's `envState` record.
   */
  domainAdapterRegistry?: DomainAdapterRegistry;
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
 * When a message carries metadata (env-state, compressed history,
 * sandbox file attachments), it's surfaced as user-role content:
 *
 * **User messages** — everything merged into one message:
 * ```
 * <memory>  (if present, always first)
 * <env-context>  (full keyframe or per-domain diff blocks)
 * attachments, mentions, selected elements
 * <user-msg>  (always last)
 * ```
 *
 * **Assistant messages** — synthetic user messages around the assistant:
 * ```
 * [synthetic user: <memory>]  ← BEFORE
 * [assistant message]
 * [synthetic user: <env-context>]    ← AFTER
 * ```
 *
 * ## Environment context — env-state pipeline
 *
 * Per-domain env state is captured once at step start (see
 * `BaseAgent.generateContextForNewStep`) via the {@link
 * DomainAdapterRegistry}: each adapter renders both its full state
 * (`renderedState`) and a diff from the prior effective state
 * (`renderedStateChange`), and unchanged domains are omitted from the
 * persisted `metadata.envState` map.
 *
 * The conversion pipeline replays these entries in order:
 *
 * - The **first message** in the conversion window (boundary message or
 *   fresh chat) emits the full-state keyframe — every active domain's
 *   `renderedState`, ordered by the registry's `renderOrder`.
 * - **Subsequent messages** emit only the per-domain
 *   `renderedStateChange` blocks for domains that changed on that turn.
 */
export const convertAgentMessagesToModelMessages = async <
  TMessage extends AgentMessage<UITools, ConvertibleMessageMetadata>,
>(
  messages: TMessage[],
  systemPrompt: string,
  tools: ToolSet,
  agentInstanceId: string,
  options: ConvertAgentMessagesOptions,
): Promise<ModelMessage[]> => {
  const {
    host,
    blobReader,
    modelCapabilities,
    logger,
    imageCache,
    skills,
    fileReadCache,
    mountPaths,
    contentLimits,
    renderExtraMention,
    domainAdapterRegistry,
    fileReadTransformers,
    reasoningSignatureSource,
  } = options;

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

  const renderOrder = domainAdapterRegistry
    ? domainAdapterRegistry.listSorted().map((a) => a.domainId)
    : null;
  let keyframeEmitted = false;

  for (let i = boundaryIndex; i < messages.length; i++) {
    const message = messages[i];
    if (!message) continue;

    const envParts = buildEnvContextParts(
      messages,
      i,
      keyframeEmitted,
      renderOrder,
    );
    if (envParts.emittedKeyframe) keyframeEmitted = true;

    const compressedPart = buildCompressedHistoryPart(
      message,
      i,
      boundaryIndex,
    );

    if (message.role === 'user') {
      const userMsg = await convertUserMessage(
        message,
        skills,
        renderExtraMention,
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
        host,
        blobReader,
        fileReadCache,
        mountPaths,
        logger,
        { preview: true },
        undefined,
        contentLimits,
        fileReadTransformers,
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

      const assistantMsgs = await convertAssistantMessage(
        message,
        tools,
        reasoningSignatureSource,
      );
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
        host,
        blobReader,
        fileReadCache,
        mountPaths,
        logger,
        undefined,
        readFileRequests,
        contentLimits,
        fileReadTransformers,
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
function findCompressionBoundary<
  TMessage extends AgentMessage<UITools, ConvertibleMessageMetadata>,
>(messages: TMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.metadata?.compressedHistory !== undefined) {
      return i;
    }
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: inject file contents from pathReferences
// ─────────────────────────────────────────────────────────────────────────────

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
async function injectFileReferences(
  pathReferences: Record<string, string> | undefined,
  seenFiles: SeenFilesTracker,
  agentInstanceId: string,
  host: HostPaths,
  blobReader: BlobReader,
  fileReadCache?: FileReadCacheService,
  mountPaths?: Map<string, string>,
  logger?: Logger,
  defaultReadParams?: ReadParams,
  readFileRequests?: ReadFileRequest[],
  contentLimits?: ContentLimits,
  extraTransformers?: Readonly<Record<string, FileTransformer>>,
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
          host,
          agentId: agentInstanceId,
          mountPaths,
          readParams: requestedParams,
          maxReadChars: contentLimits?.maxReadChars,
          maxPreviewLines: contentLimits?.maxPreviewLines,
          extraTransformers,
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
          host,
          agentId: agentInstanceId,
          mountPaths,
          readParams: requestedParams,
          maxReadChars: contentLimits?.maxReadChars,
          maxPreviewLines: contentLimits?.maxPreviewLines,
          extraTransformers,
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
        host,
        agentId: agentInstanceId,
        mountPaths,
        readParams: requestedParams,
        maxReadChars: contentLimits?.maxReadChars,
        maxPreviewLines: contentLimits?.maxPreviewLines,
        extraTransformers,
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
  emittedKeyframe: boolean;
}

/**
 * Compute the environment context parts for the message at `msgIndex`.
 *
 * - **Keyframe pass** (`keyframeEmitted === false`): emit per-domain
 *   `renderedState` for every domain with an effective entry at this
 *   message position. The boundary message uses
 *   {@link resolveEffectiveEnvStateEntries} to inherit entries from
 *   pre-boundary history when a domain didn't capture a fresh entry on
 *   the boundary turn itself. Later messages in the window only consider
 *   their own `envState` map; they emit a domain in keyframe mode only
 *   if that domain hadn't yet been rendered in this window (e.g. a host
 *   adapter registered mid-chat).
 *
 * - **Delta pass** (`keyframeEmitted === true`): emit
 *   `renderedStateChange` for each entry stamped on this exact message.
 *
 * `renderOrder` controls per-domain emission order; when absent, domains
 * are emitted in object-iteration order.
 */
function buildEnvContextParts<
  TMessage extends AgentMessage<UITools, ConvertibleMessageMetadata>,
>(
  messages: TMessage[],
  msgIndex: number,
  keyframeEmitted: boolean,
  renderOrder: readonly DomainId[] | null,
): EnvContextResult {
  const parts: UserContent = [];
  const message = messages[msgIndex];

  if (!keyframeEmitted) {
    // First message in the conversion window: render the full
    // per-domain keyframe. For the boundary message we inherit
    // effective entries from pre-boundary history; for any later
    // message that reaches this branch (the boundary itself carried
    // no env-state), we still build the keyframe from messages up to
    // and including `msgIndex`.
    const effective = resolveEffectiveEnvStateEntries(messages, msgIndex);
    const domains = sortDomainIds(Object.keys(effective), renderOrder);
    if (domains.length === 0) {
      return { parts, emittedKeyframe: false };
    }
    const sections = domains
      .map((id) => effective[id]?.renderedState ?? '')
      .filter((s) => s.length > 0);
    if (sections.length === 0) {
      return { parts, emittedKeyframe: false };
    }
    parts.push({ type: 'text', text: sections.join('\n\n') });
    return { parts, emittedKeyframe: true };
  }

  // Subsequent messages: emit per-domain diff blocks for entries
  // stamped on this exact message.
  const envState = message?.metadata?.envState;
  if (!envState) return { parts, emittedKeyframe: false };
  const domains = sortDomainIds(Object.keys(envState), renderOrder);
  const sections = domains
    .map((id) => envState[id]?.renderedStateChange ?? '')
    .filter((s) => s.length > 0);
  if (sections.length === 0) return { parts, emittedKeyframe: false };
  parts.push({ type: 'text', text: sections.join('\n\n') });
  return { parts, emittedKeyframe: false };
}

function sortDomainIds(
  ids: readonly DomainId[],
  renderOrder: readonly DomainId[] | null,
): DomainId[] {
  if (!renderOrder) return [...ids];
  const order = new Map(renderOrder.map((id, i) => [id, i]));
  const known: DomainId[] = [];
  const unknown: DomainId[] = [];
  for (const id of ids) {
    if (order.has(id)) known.push(id);
    else unknown.push(id);
  }
  known.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return [...known, ...unknown];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build compressed-history part
// ─────────────────────────────────────────────────────────────────────────────

/**
 * If this message is at the compression boundary and has compressed
 * history, return a text content part with the XML-wrapped history.
 */
function buildCompressedHistoryPart<
  TMessage extends AgentMessage<UITools, ConvertibleMessageMetadata>,
>(
  message: TMessage,
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
 * Count how many `reasoning` UI parts fall inside each step block of an
 * assistant UI message. A step block is delimited by `step-start` parts
 * (matching the segmentation that `convertToModelMessages` performs in its
 * `processBlock` loop).
 *
 * Examples:
 *   `[step-start, reasoning, text, tool, step-start, reasoning, tool]`
 *   → `[1, 1]`
 *   `[text, tool]` (no step-start) → `[0]`
 *   `[step-start, tool]` → `[0]`
 */
function countReasoningPartsPerStep(
  parts: ReadonlyArray<{ type: string }>,
): number[] {
  const counts: number[] = [];
  let current = 0;
  let inStep = false;
  for (const part of parts) {
    if (part.type === 'step-start') {
      if (inStep) counts.push(current);
      current = 0;
      inStep = true;
    } else if (part.type === 'reasoning') {
      current++;
    }
  }
  if (inStep) counts.push(current);
  if (counts.length === 0) counts.push(current);
  return counts;
}

/**
 * Legacy flat `reasoningDetails` predate source ownership and were only
 * captured from the stagewise OpenAI-compatible gateway. Replay them only
 * when their signature shape clearly identifies the current stagewise
 * provider; unknown or mixed shapes are unsafe and must be dropped.
 */
function inferLegacyReasoningProvider(
  details: Record<string, unknown>[],
): string | null {
  let inferred: string | null = null;
  for (const detail of details) {
    const hasGoogleSignature = typeof detail.thought_signature === 'string';
    const hasAnthropicSignature = typeof detail.signature === 'string';
    const provider =
      hasGoogleSignature === hasAnthropicSignature
        ? null
        : hasGoogleSignature
          ? 'google'
          : 'anthropic';
    if (!provider) return null;
    if (inferred && inferred !== provider) return null;
    inferred = provider;
  }
  return inferred;
}

/**
 * Resolve which signed `reasoning_details` (if any) may be replayed for the
 * outbound `reasoningSignatureSource`, and whether UI `reasoning` parts must
 * be stripped from the converted message.
 */
function selectReasoningDetailsForSource(
  metadata: ConvertibleMessageMetadata | undefined,
  reasoningSignatureSource?: ReasoningSignatureSource,
): {
  signedDetails: Record<string, unknown>[];
  shouldStripReasoningParts: boolean;
} {
  const ownedGroups = metadata?.ownedReasoningDetails ?? [];
  const hasOwnedReasoningDetails = ownedGroups.some(
    (group) => group.details.length > 0,
  );

  if (reasoningSignatureSource) {
    const matchingOwned = ownedGroups.filter(
      (group) =>
        group.details.length > 0 &&
        reasoningSourcesMatch(group.source, reasoningSignatureSource),
    );
    if (matchingOwned.length > 0) {
      return {
        signedDetails: matchingOwned.flatMap((group) => group.details),
        shouldStripReasoningParts: true,
      };
    }
  }

  const legacyDetails = metadata?.reasoningDetails ?? [];
  if (legacyDetails.length === 0) {
    return {
      signedDetails: [],
      shouldStripReasoningParts: hasOwnedReasoningDetails,
    };
  }

  const legacyProvider = inferLegacyReasoningProvider(legacyDetails);
  const canReplayLegacy =
    reasoningSignatureSource?.providerMode === 'stagewise' &&
    legacyProvider === reasoningSignatureSource.provider;

  return {
    signedDetails: canReplayLegacy ? legacyDetails : [],
    shouldStripReasoningParts: true,
  };
}

/**
 * Convert an assistant UI message into model messages.
 * Returns only the assistant-role message(s). Sandbox file attachments
 * are handled by the main loop alongside env-changes.
 *
 * Also round-trips matching provider-owned signed `reasoning_details`
 * through the outbound `providerOptions.openaiCompatible.reasoning_details`
 * transport hook that the SDK spreads onto the OpenAI-compatible request
 * body. Semantic ownership lives in assistant metadata and is checked here
 * before replay so signatures are never sent across provider boundaries.
 */
async function convertAssistantMessage<
  TMessage extends AgentMessage<UITools, ConvertibleMessageMetadata>,
>(
  message: TMessage,
  tools: ToolSet,
  reasoningSignatureSource?: ReasoningSignatureSource,
): Promise<ModelMessage[]> {
  const { signedDetails, shouldStripReasoningParts } =
    selectReasoningDetailsForSource(message.metadata, reasoningSignatureSource);
  const hasSignatures = signedDetails.length > 0;

  const cleanedMessage = {
    ...message,
    parts: message.parts
      // Drop `reasoning` UI parts from the outbound conversion when
      // provider-signed reasoning details are being replayed or when
      // stagewise/legacy signature metadata makes UI reasoning unsafe.
      //
      // Rationale: for the openai-compatible SDK path,
      // `convertToOpenAICompatibleChatMessages` concatenates reasoning
      // parts into a top-level `reasoning_content` string. That string is
      // UI-derived and not byte-identical to what the provider originally
      // signed. Shipping it alongside our signed `reasoning_details` array
      // causes Anthropic/Bedrock to reject the turn with `thinking blocks
      // ... cannot be modified`.
      //
      // When no stagewise/legacy signature metadata exists we leave
      // reasoning parts alone — BYOK native SDKs (@ai-sdk/anthropic,
      // @ai-sdk/google) consume them via their own signature mechanism and
      // would otherwise lose cross-turn chain-of-thought.
      //
      // UI visibility is unaffected — this filter only touches the
      // throwaway copy used for model conversion.
      .filter(
        (part) => !(shouldStripReasoningParts && part.type === 'reasoning'),
      )
      .map((part) => {
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

  const modelMessages = await convertToModelMessages(
    [cleanedMessage as unknown as AgentMessage],
    { tools },
  );

  // ── Distribute signed reasoning_details per step ─────────────────
  //
  // `convertToModelMessages` splits a multi-step assistant UI message into
  // one assistant ModelMessage per `step-start` boundary. Each step
  // originally carried its own thinking block(s); we must attach each
  // step's reasoning_details to the ModelMessage that represents that step,
  // not dump them all onto the first one (which makes Anthropic reject the
  // turn with `thinking blocks ... cannot be modified`).
  //
  // The UI parts and the selected details array are both ordered by (step,
  // position-in-step), so counting reasoning parts per step block and
  // slicing the details array the same way keeps them aligned.
  if (hasSignatures) {
    const reasoningCountsPerStep = countReasoningPartsPerStep(message.parts);
    const totalReasoningParts = reasoningCountsPerStep.reduce(
      (a, b) => a + b,
      0,
    );

    const detailsPerStep: Record<string, unknown>[][] = [];
    if (
      totalReasoningParts === signedDetails.length &&
      reasoningCountsPerStep.length > 0
    ) {
      let cursor = 0;
      for (const count of reasoningCountsPerStep) {
        detailsPerStep.push(signedDetails.slice(cursor, cursor + count));
        cursor += count;
      }
    }

    let stepIdx = 0;
    let usedFallback = detailsPerStep.length === 0;
    for (const modelMessage of modelMessages) {
      if (modelMessage.role !== 'assistant') continue;

      let stepDetails: Record<string, unknown>[];
      if (usedFallback) {
        // Legacy fallback: attach everything to the first assistant message.
        stepDetails = signedDetails;
        usedFallback = false;
      } else {
        stepDetails = detailsPerStep[stepIdx] ?? [];
        stepIdx++;
      }

      if (stepDetails.length === 0) continue;

      // `providerOptions` is typed as `JSONValue`, but the SDK reads
      // `message.providerOptions.openaiCompatible` verbatim and spreads it
      // onto the outbound assistant message body. `reasoning_details`
      // entries are provider-shaped records and JSON-serialisable at
      // runtime; the cast is needed because TS's `JSONObject` forbids
      // `unknown` values even though the wire format is plain JSON.
      const prior = (modelMessage.providerOptions ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      const priorOC = (prior.openaiCompatible ?? {}) as Record<string, unknown>;
      modelMessage.providerOptions = {
        ...prior,
        openaiCompatible: {
          ...priorOC,
          reasoning_details: stepDetails,
        },
      } as unknown as typeof modelMessage.providerOptions;
    }
  }

  return modelMessages;
}

/**
 * Convert a user UI message into a single `UserModelMessage`.
 *
 * Wraps user text in `<user-msg>`. File attachments and file/workspace
 * mentions are handled by the `pathReferences` pipeline; only
 * host-specific mention types (e.g. browser tab mentions) are still
 * rendered here through the optional `renderExtraMention` callback.
 */
async function convertUserMessage<
  TMessage extends AgentMessage<UITools, ConvertibleMessageMetadata>,
>(
  message: TMessage,
  skills: ReadonlyArray<SkillDefinition> | undefined,
  renderExtraMention: ExtraMentionRenderer | undefined,
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
    await convertToModelMessages([
      { ...message, parts } as unknown as AgentMessage,
    ])
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

  // File and workspace mentions are handled by the pathReferences
  // pipeline. Any other mention kind is delegated to the host renderer.
  if (
    renderExtraMention &&
    message.metadata?.mentions &&
    message.metadata.mentions.length > 0
  ) {
    const extraMentionTexts: string[] = [];
    for (const mention of message.metadata.mentions) {
      if (
        mention.providerType === 'file' ||
        mention.providerType === 'workspace'
      )
        continue;
      const rendered = renderExtraMention(mention);
      if (rendered) extraMentionTexts.push(rendered);
    }
    if (extraMentionTexts.length > 0) {
      (converted.content as (TextPart | ImagePart | FilePart)[]).push({
        type: 'text',
        text: extraMentionTexts.join('\n'),
      });
    }
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
    if (messages[i]?.role === 'user') {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx > 0) {
    for (let i = lastUserIdx - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') {
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
