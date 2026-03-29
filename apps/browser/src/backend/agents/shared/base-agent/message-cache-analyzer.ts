import type { ModelMessage } from 'ai';
import type { Logger } from '@/services/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when a message has been annotated with a cache_control
 * breakpoint by either of the two provider-option shapes used in the codebase:
 *
 *   anthropic.cacheControl    — Anthropic-native SDK key
 *   openaiCompatible.cache_control — OpenAI-compatible/stagewise gateway key
 */
function hasCacheControl(message: ModelMessage): boolean {
  const opts = (message as Record<string, unknown>).providerOptions as
    | Record<string, unknown>
    | undefined;
  if (!opts) return false;
  const anthropic = opts.anthropic as Record<string, unknown> | undefined;
  const oaic = opts.openaiCompatible as Record<string, unknown> | undefined;
  return !!(anthropic?.cacheControl ?? oaic?.cache_control);
}

/**
 * Splits `messages` into chunks at every cache_control-annotated message
 * (the annotated message is the **last** element of its chunk).
 *
 * Example:
 *   [A, B(cc), C, D(cc), E]  →  [[A, B(cc)], [C, D(cc)], [E]]
 *
 * When no cache_control annotations exist the whole array is one chunk.
 */
function splitIntoChunks(messages: ModelMessage[]): ModelMessage[][] {
  if (messages.length === 0) return [];

  const chunks: ModelMessage[][] = [];
  let current: ModelMessage[] = [];

  for (const msg of messages) {
    current.push(msg);
    if (hasCacheControl(msg)) {
      chunks.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Extracts only the cache-relevant fields of a ModelMessage.
 *
 * Provider metadata (`providerOptions`, etc.) is intentionally excluded:
 * it carries cache-control annotations and other per-request headers that
 * legitimately change between steps without affecting cache eligibility.
 */
function cacheKey(msg: ModelMessage): string {
  return JSON.stringify({ role: msg.role, content: msg.content });
}

/** Truncate a string for display, inserting an ellipsis in the middle. */
function truncate(s: string, maxLen = 120): string {
  if (s.length <= maxLen) return s;
  const half = Math.floor((maxLen - 3) / 2);
  return `${s.slice(0, half)}...${s.slice(s.length - half)}`;
}

/**
 * Finds the first position where two arrays of ModelMessages differ and
 * returns a compact human-readable description.
 *
 * Reports:
 *  - index of the first differing message
 *  - role of that message
 *  - first top-level key whose value changed (or whether the message was
 *    added/removed entirely)
 *  - truncated before/after snippet for that key
 */
function describeFirstDiff(
  oldChunk: ModelMessage[],
  newChunk: ModelMessage[],
): string {
  const minLen = Math.min(oldChunk.length, newChunk.length);

  for (let i = 0; i < minLen; i++) {
    const oldMsg = oldChunk[i] as Record<string, unknown>;
    const newMsg = newChunk[i] as Record<string, unknown>;

    // Fast path: identical (role + content only)
    if (cacheKey(oldChunk[i]) === cacheKey(newChunk[i])) continue;

    // Find which cache-relevant key differs first
    const allKeys: Array<keyof ModelMessage> = ['role', 'content'];
    for (const key of allKeys) {
      const oldVal = JSON.stringify(oldMsg[key] ?? null);
      const newVal = JSON.stringify(newMsg[key] ?? null);
      if (oldVal !== newVal) {
        return (
          `msg[${i}] role=${String(oldMsg.role ?? newMsg.role)} ` +
          `key="${key}" ` +
          `before=${truncate(oldVal)} ` +
          `after=${truncate(newVal)}`
        );
      }
    }

    // Keys are the same but something nested differs (should not happen given
    // the loop above, but guard anyway)
    return `msg[${i}] role=${String(oldMsg.role ?? '')} — nested diff (all keys equal at top level)`;
  }

  // Lengths differ but all shared messages are equal
  if (oldChunk.length !== newChunk.length) {
    if (newChunk.length > oldChunk.length) {
      const added = newChunk[oldChunk.length] as Record<string, unknown>;
      return `msg[${oldChunk.length}] ADDED role=${String(added.role ?? '?')}`;
    }
    const removed = oldChunk[newChunk.length] as Record<string, unknown>;
    return `msg[${newChunk.length}] REMOVED role=${String(removed.role ?? '?')}`;
  }

  return 'no difference found (deepEqual should have matched)';
}

/**
 * Returns true when `newSnapshot` is either:
 *  - **Exactly equal** to `oldSnapshot`, or
 *  - A **superset prefix extension**: starts with every serialised key from
 *    `oldSnapshot` and may have additional entries appended.
 *
 * Operates entirely on pre-serialised strings — no object references.
 */
function snapshotMatchesOrExtends(
  oldSnapshot: ChunkSnapshot,
  newSnapshot: ChunkSnapshot,
): boolean {
  if (newSnapshot.length < oldSnapshot.length) return false;
  for (let i = 0; i < oldSnapshot.length; i++) {
    if (oldSnapshot[i] !== newSnapshot[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

interface ChunkResult {
  chunkIndex: number;
  status: 'hit-exact' | 'hit-extended' | 'miss' | 'new' | 'dropped';
  /** Number of messages in the previous-step chunk (0 if the chunk is new). */
  prevSize: number;
  /** Number of messages in the current-step chunk (0 if the chunk was dropped). */
  currSize: number;
}

/**
 * Tracks model-message arrays across agent steps and logs a per-chunk cache
 * stability report before each `streamText` call.
 *
 * **Lifecycle**
 *  - Instantiate once when the agent is created.
 *  - Call `trackStep(finalModelMessages)` right before every `streamText`
 *    invocation, after all preprocessing pipelines have run.
 *
 * **Analysis logic**
 *  1. Split the message array into *chunks* at every `cache_control`-annotated
 *     message (that message is the last element of its chunk).  When no
 *     annotations are present, the whole array is treated as a single chunk.
 *  2. For each chunk position, compare against the same position in the
 *     previous step:
 *     - **hit-exact**: chunk is byte-for-byte identical → guaranteed cache hit
 *     - **hit-extended**: new chunk starts with all old messages plus more →
 *       the cached prefix will still be reused
 *     - **miss**: content changed → cache miss for this chunk
 *     - **new**: chunk index did not exist in the previous step
 *     - **dropped**: chunk existed before but no longer present
 *
 * All logging uses `logger.debug` so the output is gated behind the debug
 * log level and has zero cost in production.
 */
/**
 * A snapshot of a chunk stored purely by value: one serialised `cacheKey`
 * string per message. Holding strings instead of object references means
 * mutations to the original ModelMessage objects after `trackStep` returns
 * cannot affect the baseline used for the next comparison.
 */
type ChunkSnapshot = string[];

export class MessageCacheAnalyzer {
  /** Serialised snapshots of the chunks from the previous step. */
  private prevSnapshots: ChunkSnapshot[] | null = null;
  private stepCount = 0;

  constructor(
    private readonly instanceId: string,
    private readonly logger: Logger,
  ) {}

  /**
   * Record the final model messages for one agent step and schedule a
   * cache-stability analysis.  Returns immediately; the analysis is
   * deferred via `setImmediate` so it never blocks step execution.
   */
  trackStep(messages: ModelMessage[]): void {
    const stepNum = ++this.stepCount;
    const prevSnapshots = this.prevSnapshots;
    const newChunks = splitIntoChunks(messages);

    // Snapshot by value immediately — serialise to strings so we hold no
    // references to the live ModelMessage objects.
    const newSnapshots: ChunkSnapshot[] = newChunks.map((chunk) =>
      chunk.map(cacheKey),
    );

    // Update baseline before scheduling so concurrent calls see the freshest
    // state.  (In practice steps are serial, but this is safer.)
    this.prevSnapshots = newSnapshots;

    setImmediate(() => {
      this._logAnalysis(
        stepNum,
        prevSnapshots,
        newSnapshots,
        newChunks,
        messages.length,
      );
    });
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private _logAnalysis(
    stepNum: number,
    prevSnapshots: ChunkSnapshot[] | null,
    newSnapshots: ChunkSnapshot[],
    /** Raw chunks kept only for `describeFirstDiff` on misses — read-only. */
    newChunks: ModelMessage[][],
    totalMessages: number,
  ): void {
    const tag = `[CacheAnalyzer:${this.instanceId}] step=${stepNum}`;

    if (prevSnapshots === null) {
      this.logger.debug(
        `${tag} | messages=${totalMessages} chunks=${newChunks.length} | first step — no prior state to compare`,
      );
      return;
    }

    const results: ChunkResult[] = [];
    const maxLen = Math.max(prevSnapshots.length, newSnapshots.length);

    for (let i = 0; i < maxLen; i++) {
      const prev = prevSnapshots[i] ?? null;
      const curr = newSnapshots[i] ?? null;

      if (prev === null) {
        results.push({
          chunkIndex: i,
          status: 'new',
          prevSize: 0,
          currSize: curr!.length,
        });
      } else if (curr === null) {
        results.push({
          chunkIndex: i,
          status: 'dropped',
          prevSize: prev.length,
          currSize: 0,
        });
      } else {
        const matches = snapshotMatchesOrExtends(prev, curr);
        results.push({
          chunkIndex: i,
          status: matches
            ? curr.length === prev.length
              ? 'hit-exact'
              : 'hit-extended'
            : 'miss',
          prevSize: prev.length,
          currSize: curr.length,
        });
      }
    }

    const hits = results.filter(
      (r) => r.status === 'hit-exact' || r.status === 'hit-extended',
    ).length;
    const misses = results.filter((r) => r.status === 'miss').length;
    const newChunkCount = results.filter((r) => r.status === 'new').length;
    const dropped = results.filter((r) => r.status === 'dropped').length;

    this.logger.debug(
      `${tag} | messages=${totalMessages} chunks=${newChunks.length} ` +
        `| hits=${hits} misses=${misses} new=${newChunkCount} dropped=${dropped}`,
    );

    for (const r of results) {
      const sizeLabel =
        r.prevSize === r.currSize
          ? `size=${r.currSize}`
          : `size=${r.prevSize}→${r.currSize}`;

      switch (r.status) {
        case 'hit-exact':
          this.logger.debug(
            `${tag} | chunk[${r.chunkIndex}] ✓ HIT (exact) ${sizeLabel}`,
          );
          break;
        case 'hit-extended':
          this.logger.debug(
            `${tag} | chunk[${r.chunkIndex}] ✓ HIT (extended +${r.currSize - r.prevSize} msgs) ${sizeLabel}`,
          );
          break;
        case 'miss': {
          // For the diff description we need the raw new messages; the prev
          // baseline is re-parsed from its snapshot strings so we never touch
          // live object references.
          const prevC = prevSnapshots![r.chunkIndex].map(
            (s) => JSON.parse(s) as ModelMessage,
          );
          const newC = newChunks[r.chunkIndex];
          const diff = describeFirstDiff(prevC, newC);
          this.logger.debug(
            `${tag} | chunk[${r.chunkIndex}] ✗ MISS ${sizeLabel} | first diff: ${diff}`,
          );
          break;
        }
        case 'new':
          this.logger.debug(
            `${tag} | chunk[${r.chunkIndex}] + NEW ${sizeLabel}`,
          );
          break;
        case 'dropped':
          this.logger.debug(
            `${tag} | chunk[${r.chunkIndex}] - DROPPED ${sizeLabel}`,
          );
          break;
      }
    }
  }
}
