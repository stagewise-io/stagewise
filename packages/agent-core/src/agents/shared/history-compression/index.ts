import { generateText, type UITools } from 'ai';
import type { AgentMessage } from '../../../types/agent';
import type { AgentHost } from '../../../host/host';
import {
  PROVIDER_INSTANCE_ID_METADATA_KEY,
  UTILITY_THINKING_OVERRIDE_METADATA_KEY,
  type HostModels,
  type UtilityModelEntry,
} from '../../../host/models';

/**
 * Wide AgentMessage type accepting any tool set and any metadata shape.
 * See `serialization.ts` for the rationale — this module mirrors the
 * same widening so host-side message shapes (browser, CLI) can be
 * passed in without TypeScript variance issues.
 */
type WideAgentMessage = AgentMessage<UITools, any>;

// Import for local use + re-export so existing imports keep working.
import {
  convertAgentMessagesToCompactMessageHistoryString,
  estimateMessageTokens,
} from './serialization';
export {
  convertAgentMessagesToCompactMessageHistoryString,
  estimateMessageTokens,
};

// Re-export prompt pieces so existing imports from this module keep working.
import {
  COMPRESSION_MERGE_SYSTEM_PROMPT,
  COMPRESSION_SEGMENT_SYSTEM_PROMPT,
  COMPRESSION_SYSTEM_PROMPT,
  COMPRESSION_TARGET_CHARS,
  buildCompressionMergeUserMessage,
  buildCompressionSegmentUserMessage,
  buildCompressionUserMessage,
} from './prompt';
export {
  COMPRESSION_MERGE_SYSTEM_PROMPT,
  COMPRESSION_SEGMENT_SYSTEM_PROMPT,
  COMPRESSION_SYSTEM_PROMPT,
  COMPRESSION_TARGET_CHARS,
  buildCompressionMergeUserMessage,
  buildCompressionSegmentUserMessage,
  buildCompressionUserMessage,
};

// Typed builder for host-side tool part serializer registries.
export {
  defineToolPartSerializers,
  type TypedToolPartSerializers,
} from './define-tool-part-serializers';

/**
 * Ordered list of model IDs to try for history compression.
 * The first model is the primary; subsequent entries are fallbacks
 * tried in order when the previous one fails or times out.
 */
export const HISTORY_COMPRESSION_MODELS = [
  'default',
  'deepseek-v4-flash',
  'gpt-5.6-luna',
  'gemini-3.1-flash-lite',
  'claude-haiku-4.5',
] as const;

/** Maximum time (ms) allowed for a single history compression attempt. */
const HISTORY_COMPRESSION_TIMEOUT_MS = 30_000;

/**
 * Grace period after aborting a timed-out compression request.
 *
 * If the provider/SDK does not settle the original request within this
 * window, stop the cascade instead of starting overlapping fallback
 * requests that can continue billing in the background.
 */
const HISTORY_COMPRESSION_ABORT_GRACE_MS = 2_000;

/** Minimum acceptable compression length; shorter results trigger a fallback. */
const COMPRESSION_MIN_LENGTH = 30;

/**
 * Maximum serialized-input size (in estimated tokens, chars / 4) sent to a
 * single compression model call.
 *
 * The compressed prefix can be hundreds of thousands of tokens on
 * large-context models (everything before the kept-message budget is
 * compressed at once). Sending that in one call exceeds provider limits and
 * the 30s timeout, which is why compression silently failed on large-context
 * models. Larger inputs are compressed segment-by-segment ("map") and the
 * partial briefings merged ("reduce") so every request stays bounded.
 */
export const COMPRESSION_INPUT_TOKEN_BUDGET = 60_000;

/** Character equivalent of {@link COMPRESSION_INPUT_TOKEN_BUDGET}. */
const COMPRESSION_INPUT_CHAR_BUDGET = COMPRESSION_INPUT_TOKEN_BUDGET * 4;

/** Matches one top-level serialized block (content is escaped, so no nesting). */
const SERIALIZED_BLOCK_PATTERN =
  /<(previous-chat-history|user|assistant)>[\s\S]*?<\/\1>/g;

class HistoryCompressionUnsettledTimeoutError extends Error {
  constructor(modelId: string) {
    super(
      `History compression request for ${modelId} timed out and did not settle after abort`,
    );
    this.name = 'HistoryCompressionUnsettledTimeoutError';
  }
}

/**
 * Attempts a single compression call against the given model.
 * Returns the compressed text on success, or throws on failure.
 */
const tryCompressWithModel = async (
  entry: UtilityModelEntry,
  hostModels: HostModels,
  agentInstanceId: string,
  systemPrompt: string,
  userMessage: string,
  host?: AgentHost,
): Promise<string> => {
  const metadata: Record<string, unknown> = {
    $ai_span_name: 'history-compression',
    $ai_parent_id: `${agentInstanceId}`,
  };
  if (entry.providerInstanceId) {
    metadata[PROVIDER_INSTANCE_ID_METADATA_KEY] = entry.providerInstanceId;
  }
  if (entry.thinkingOverride) {
    metadata[UTILITY_THINKING_OVERRIDE_METADATA_KEY] = entry.thinkingOverride;
  }
  const modelWithOptions = await hostModels.getWithOptions(
    entry.modelId,
    `${agentInstanceId}`,
    metadata,
  );

  host?.logger.debug(
    `[history-compression] Attempting model "${entry.modelId}"` +
      ` (instance="${entry.providerInstanceId ?? 'default'}")` +
      ` for agent ${agentInstanceId}.`,
  );

  const abortController = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortGraceTimeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const generationPromise = generateText({
      model: modelWithOptions.model,
      providerOptions: modelWithOptions.providerOptions,
      headers: modelWithOptions.headers,
      abortSignal: abortController.signal,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
      temperature: 0.1,
      maxOutputTokens: 20000,
    }).then((result) => result.text.trim());

    const timeoutResult = Symbol('history-compression-timeout');
    const timeoutPromise = new Promise<typeof timeoutResult>((resolve) => {
      timeout = setTimeout(() => {
        abortController.abort();
        resolve(timeoutResult);
      }, HISTORY_COMPRESSION_TIMEOUT_MS);
    });

    const racedResult = await Promise.race([generationPromise, timeoutPromise]);

    const compactionResult =
      racedResult === timeoutResult
        ? await Promise.race([
            generationPromise.then(
              (result) => ({ status: 'fulfilled' as const, result }),
              (error) => ({ status: 'rejected' as const, error }),
            ),
            new Promise<{ status: 'pending' }>((resolve) => {
              abortGraceTimeout = setTimeout(
                () => resolve({ status: 'pending' }),
                HISTORY_COMPRESSION_ABORT_GRACE_MS,
              );
            }),
          ]).then((settled) => {
            if (settled.status === 'fulfilled') return settled.result;
            if (settled.status === 'rejected') throw settled.error;
            throw new HistoryCompressionUnsettledTimeoutError(entry.modelId);
          })
        : racedResult;

    if (compactionResult.length < COMPRESSION_MIN_LENGTH) {
      throw new Error(
        `Compression too short (${compactionResult.length} chars)`,
      );
    }

    host?.logger.debug(
      `[history-compression] Success with model "${entry.modelId}"` +
        ` (instance="${entry.providerInstanceId ?? 'default'}")` +
        ` — ${compactionResult.length} chars.`,
    );
    return compactionResult;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abortGraceTimeout) clearTimeout(abortGraceTimeout);
  }
};

/**
 * Truncates an oversized single block, keeping its head and tail so the
 * start and the (most recent) end of the block survive the cut.
 */
function truncateOversizedBlock(block: string, limit: number): string {
  if (block.length <= limit) return block;
  const marker = `\n[... ${block.length - limit} characters omitted for length ...]\n`;
  const keep = Math.max(0, limit - marker.length);
  const head = Math.ceil(keep * 0.6);
  const tail = keep - head;
  return `${block.slice(0, head)}${marker}${block.slice(block.length - tail)}`;
}

/**
 * Splits the serialized compact history into token-bounded chunks, cutting
 * only at top-level block boundaries so no XML tag is ever broken. Oversized
 * single blocks are head/tail-truncated to keep every call bounded.
 */
export function splitCompactHistoryIntoChunks(
  compactHistory: string,
  charBudget: number = COMPRESSION_INPUT_CHAR_BUDGET,
): string[] {
  if (compactHistory.length <= charBudget) return [compactHistory];

  const blocks: string[] = [];
  let cursor = 0;
  for (const match of compactHistory.matchAll(SERIALIZED_BLOCK_PATTERN)) {
    const start = match.index ?? 0;
    // Preserve non-whitespace text between blocks rather than dropping it.
    // Pure separators (newlines) are re-added when chunks are joined.
    const gap = compactHistory.slice(cursor, start);
    cursor = start + match[0].length;
    blocks.push(gap.trim().length > 0 ? gap + match[0] : match[0]);
  }
  const trailing = compactHistory.slice(cursor);
  if (trailing.trim().length > 0) {
    if (blocks.length > 0) blocks[blocks.length - 1] += trailing;
    else blocks.push(trailing);
  }

  // No recognizable blocks (should not happen) — fall back to raw slicing.
  if (blocks.length === 0) {
    const chunks: string[] = [];
    for (let i = 0; i < compactHistory.length; i += charBudget) {
      chunks.push(compactHistory.slice(i, i + charBudget));
    }
    return chunks;
  }

  const chunks: string[] = [];
  let current = '';
  for (const rawBlock of blocks) {
    const block = truncateOversizedBlock(rawBlock, charBudget);
    if (current.length > 0 && current.length + block.length + 1 > charBudget) {
      chunks.push(current);
      current = '';
    }
    current = current.length > 0 ? `${current}\n${block}` : block;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Groups consecutive strings into batches that fit within `charBudget`. */
function groupStringsByBudget(items: string[], charBudget: number): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;
  for (const item of items) {
    const cost = item.length + 1;
    if (current.length > 0 && currentChars + cost > charBudget) {
      groups.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += cost;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Reduces partial briefings to a single briefing by merging batches until one
 * remains. Guarantees progress: if a pass cannot reduce the count (a single
 * partial already fills the budget), everything is merged in one final call.
 */
async function mergePartialBriefings(
  entry: UtilityModelEntry,
  hostModels: HostModels,
  agentInstanceId: string,
  partials: string[],
  previousBriefingChars: number,
  host?: AgentHost,
): Promise<string> {
  if (partials.length === 1) return partials[0]!;

  const batches = groupStringsByBudget(partials, COMPRESSION_INPUT_CHAR_BUDGET);
  const canReduce = batches.length < partials.length;

  const merged: string[] = [];
  for (const batch of batches) {
    if (batch.length === 1) {
      merged.push(batch[0]!);
      continue;
    }
    merged.push(
      await tryCompressWithModel(
        entry,
        hostModels,
        agentInstanceId,
        COMPRESSION_MERGE_SYSTEM_PROMPT,
        buildCompressionMergeUserMessage(batch, previousBriefingChars),
        host,
      ),
    );
  }

  if (!canReduce || merged.length >= partials.length) {
    return tryCompressWithModel(
      entry,
      hostModels,
      agentInstanceId,
      COMPRESSION_MERGE_SYSTEM_PROMPT,
      buildCompressionMergeUserMessage(partials, previousBriefingChars),
      host,
    );
  }

  return mergePartialBriefings(
    entry,
    hostModels,
    agentInstanceId,
    merged,
    previousBriefingChars,
    host,
  );
}

/**
 * Compresses the serialized history with one model entry, using a single call
 * when it fits the input budget and a map/reduce pass when it does not.
 */
async function compressWithEntry(
  entry: UtilityModelEntry,
  hostModels: HostModels,
  agentInstanceId: string,
  compactHistory: string,
  previousBriefingChars: number,
  host?: AgentHost,
): Promise<string> {
  const chunks = splitCompactHistoryIntoChunks(compactHistory);
  if (chunks.length <= 1) {
    // `chunks[0]` equals the input when it fits; it is the truncated block
    // when a single oversized block forced truncation.
    const singleInput = chunks[0] ?? compactHistory;
    return tryCompressWithModel(
      entry,
      hostModels,
      agentInstanceId,
      COMPRESSION_SYSTEM_PROMPT,
      buildCompressionUserMessage(singleInput, previousBriefingChars),
      host,
    );
  }

  host?.logger.debug(
    `[history-compression] Input exceeds budget (${compactHistory.length} chars); ` +
      `compressing ${chunks.length} segments with model "${entry.modelId}".`,
  );

  const partials: string[] = [];
  for (const chunk of chunks) {
    partials.push(
      await tryCompressWithModel(
        entry,
        hostModels,
        agentInstanceId,
        COMPRESSION_SEGMENT_SYSTEM_PROMPT,
        buildCompressionSegmentUserMessage(chunk),
        host,
      ),
    );
  }

  return await mergePartialBriefings(
    entry,
    hostModels,
    agentInstanceId,
    partials,
    previousBriefingChars,
    host,
  );
}

export const generateSimpleCompressedHistory = async (
  messages: WideAgentMessage[],
  hostModels: HostModels,
  agentInstanceId: string,
  fallbackModelId?: string,
  fallbackProviderInstanceId?: string,
  host?: AgentHost,
): Promise<string> => {
  const compactConvertedChatHistory =
    convertAgentMessagesToCompactMessageHistoryString(messages, host);

  // Find the previous briefing length (if any) so we can inject a dynamic
  // budget hint into the user message.
  const previousBriefingChars =
    [...messages].reverse().find((m) => m.metadata?.compressedHistory)?.metadata
      ?.compressedHistory?.length ?? 0;

  let lastError: Error | undefined;

  // Use user-configured utility models when available.
  // - undefined: not configured → use built-in defaults
  // - []: explicitly cleared → use main chat model as fallback
  // - [...items]: user-configured list
  const configuredEntries = hostModels.getUtilityModelEntries?.(
    'context-compression',
  );
  const configuredModels = hostModels.getUtilityModelIds?.(
    'context-compression',
  );

  // Build a unified list of entries (with thinking overrides) from
  // whichever method the host implements.
  const fallbackEntry: UtilityModelEntry | null = fallbackModelId
    ? {
        modelId: fallbackModelId,
        ...(fallbackProviderInstanceId
          ? { providerInstanceId: fallbackProviderInstanceId }
          : {}),
      }
    : null;

  let entries: UtilityModelEntry[];
  if (configuredEntries !== undefined) {
    entries =
      configuredEntries.length > 0
        ? configuredEntries
        : fallbackEntry
          ? [fallbackEntry]
          : (HISTORY_COMPRESSION_MODELS as readonly string[]).map((id) => ({
              modelId: id,
            }));
  } else if (configuredModels !== undefined) {
    entries =
      configuredModels.length > 0
        ? configuredModels.map((id) => ({ modelId: id }))
        : fallbackEntry
          ? [fallbackEntry]
          : (HISTORY_COMPRESSION_MODELS as readonly string[]).map((id) => ({
              modelId: id,
            }));
  } else {
    entries = (HISTORY_COMPRESSION_MODELS as readonly string[]).map((id) => ({
      modelId: id,
    }));
  }

  // Append the active preset's model list (main model + fallbacks) so
  // the main chat models serve as ordered fallbacks after all utility
  // models are exhausted. Dedup by (modelId, providerInstanceId) in the
  // loop below prevents double-attempts of models that appear in both
  // lists.
  const presetModels = hostModels.getActivePresetModels?.();
  if (presetModels && presetModels.length > 0) {
    entries = [...entries, ...presetModels];
  }

  const attemptedKeys = new Set<string>();

  for (const entry of entries) {
    if (hostModels.supportsUtilityCalls?.(entry) === false) continue;
    // Skip models that are no longer available (deleted provider, etc.)
    // Pass `providerInstanceId` so discovered models (which only exist
    // on a specific instance) are not falsely rejected.
    if (!hostModels.has(entry.modelId, entry.providerInstanceId)) continue;
    // Deduplicate by (modelId, providerInstanceId) so the active
    // fallback remains available even if a failed entry shared the
    // same model ID on a different instance.
    const key = `${entry.modelId}::${entry.providerInstanceId ?? ''}`;
    if (attemptedKeys.has(key)) continue;
    attemptedKeys.add(key);
    try {
      return await compressWithEntry(
        entry,
        hostModels,
        agentInstanceId,
        compactConvertedChatHistory,
        previousBriefingChars,
        host,
      );
    } catch (e) {
      lastError = e as Error;
      if (lastError instanceof HistoryCompressionUnsettledTimeoutError) {
        throw lastError;
      }
      // Continue to the next fallback model
    }
  }

  // Last resort: try the active chat model if it wasn't already
  // attempted (e.g. when no preset models were available).
  const fallbackKey = `${fallbackModelId}::${fallbackProviderInstanceId ?? ''}`;
  if (
    fallbackModelId &&
    !attemptedKeys.has(fallbackKey) &&
    hostModels.supportsUtilityCalls?.(
      fallbackEntry ?? { modelId: fallbackModelId },
    ) !== false
  ) {
    host?.logger.warn(
      `History compression: all preferred models failed, falling back to active model: ${fallbackModelId}`,
    );
    try {
      return await compressWithEntry(
        fallbackEntry ?? { modelId: fallbackModelId },
        hostModels,
        agentInstanceId,
        compactConvertedChatHistory,
        previousBriefingChars,
        host,
      );
    } catch (e) {
      lastError = e as Error;
      if (lastError instanceof HistoryCompressionUnsettledTimeoutError) {
        throw lastError;
      }
    }
  }

  // All models failed — rethrow the last error so the caller can handle it
  throw lastError ?? new Error('All history compression models failed');
};
