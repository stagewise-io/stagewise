import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  truncate,
  writeFile,
} from '../../../fs';
import type { AgentHost } from '../../../host/host';
import type { AgentMessage } from '../../../types/agent';
import { upsertMemoryIndexEntry } from './global-index';
import {
  serializeAgentMemoryHistoryChunked,
  serializeAgentMemoryJsonl,
  serializeAgentMemoryMarkdownSlice,
  stringifyMemoryJson,
  type WideAgentMessage,
} from './serialization';

export type MemoryWriteReason =
  | 'post-step'
  | 'compression'
  | 'user-message'
  | 'queued-messages'
  | 'title';

const SCHEMA_VERSION = 3;
const FORCE_REWRITE_AFTER_APPENDS = 20;
const HASH_YIELD_INTERVAL = 50;
const snapshotWriteQueues = new Map<string, Promise<void>>();

// Per-message content digests keyed by message object. Agent history lives in
// an Immer store, so frozen messages never change in place and their digest
// can be reused across flushes. Unfrozen messages are rehashed every time.
const messageContentDigests = new WeakMap<object, string>();

export interface AgentMemoryWriterOptions {
  host: AgentHost;
  agentInstanceId: string;
}

export interface WriteAgentMemorySnapshotOptions {
  host: AgentHost;
  agentInstanceId: string;
  title: string;
  activeModelId: string;
  activeProviderInstanceId?: string;
  history: readonly AgentMessage[];
  reason: MemoryWriteReason;
}

export interface AgentMemoryFlushOptions {
  title: string;
  activeModelId: string;
  activeProviderInstanceId?: string;
  history: readonly AgentMessage[];
  reason: MemoryWriteReason;
}

export interface AgentMemoryArchiveState {
  archivedCount: number;
  archivedIdsHash: string;
  archivedContentHash: string;
  mdBytes: number;
  jsonlBytes: number;
  appendsSinceRewrite: number;
  /** Hashes of the first `archivedCount - 1` messages. */
  prefixIdsHash?: string;
  prefixContentHash?: string;
  /** Byte offsets where the last archived message starts in each file. */
  tailMdOffset?: number;
  tailJsonlOffset?: number;
}

interface TailOffsets {
  md: number;
  jsonl: number;
}

export interface AgentMemoryMetadata {
  schemaVersion: number;
  agentInstanceId: string;
  title: string;
  activeModelId: string;
  activeProviderInstanceId?: string;
  messageCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  updatedAt: string;
  reason: MemoryWriteReason;
  archive?: AgentMemoryArchiveState;
}

export interface AgentMemoryIndexEntry {
  agentInstanceId: string;
  title: string;
  activeModelId: string;
  activeProviderInstanceId?: string;
  messageCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  updatedAt: string;
}

function getMessageCreatedAt(message: AgentMessage): string | null {
  const metadata = (message as { metadata?: { createdAt?: unknown } }).metadata;
  const value = metadata?.createdAt;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function hashMessageIds(
  history: readonly AgentMessage[],
  count: number,
): string {
  const hash = createHash('sha256');
  for (let index = 0; index < count; index++) {
    hash.update(history[index]?.id ?? '');
    hash.update('\n');
  }
  return hash.digest('hex');
}

async function hashMessageContentWithPrefix(
  history: readonly AgentMessage[],
  count: number,
): Promise<{ prefix: string; full: string }> {
  const hash = createHash('sha256');
  let prefix: string | null = null;
  let computedSinceYield = 0;
  for (let index = 0; index < count; index++) {
    if (index === count - 1) prefix = hash.copy().digest('hex');
    const message = history[index];
    let digest = message ? messageContentDigests.get(message) : undefined;
    if (digest === undefined) {
      digest = createHash('sha256')
        .update(stringifyMemoryJson(message ?? null))
        .digest('hex');
      if (message && Object.isFrozen(message)) {
        messageContentDigests.set(message, digest);
      }
      if (++computedSinceYield >= HASH_YIELD_INTERVAL) {
        computedSinceYield = 0;
        await yieldToEventLoop();
      }
    }
    hash.update(digest);
    hash.update('\n');
  }
  const full = hash.digest('hex');
  return { prefix: prefix ?? full, full };
}

async function hashMessageContent(
  history: readonly AgentMessage[],
  count: number,
): Promise<string> {
  return (await hashMessageContentWithPrefix(history, count)).full;
}

function computeMetadata(
  agentInstanceId: string,
  options: AgentMemoryFlushOptions,
  updatedAt: Date,
  archive: AgentMemoryArchiveState,
): AgentMemoryMetadata {
  const firstMessageAt = options.history[0]
    ? getMessageCreatedAt(options.history[0])
    : null;
  const last = options.history.at(-1);
  const lastMessageAt = last ? getMessageCreatedAt(last) : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    agentInstanceId,
    title: options.title,
    activeModelId: options.activeModelId,
    activeProviderInstanceId: options.activeProviderInstanceId,
    messageCount: options.history.length,
    firstMessageAt,
    lastMessageAt,
    updatedAt: updatedAt.toISOString(),
    reason: options.reason,
    archive,
  };
}

function toIndexEntry(metadata: AgentMemoryMetadata): AgentMemoryIndexEntry {
  return {
    agentInstanceId: metadata.agentInstanceId,
    title: metadata.title,
    activeModelId: metadata.activeModelId,
    activeProviderInstanceId: metadata.activeProviderInstanceId,
    messageCount: metadata.messageCount,
    firstMessageAt: metadata.firstMessageAt,
    lastMessageAt: metadata.lastMessageAt,
    updatedAt: metadata.updatedAt,
  };
}

async function writeFileAtomic(
  filePath: string,
  content: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await writeFile(tmp, content, 'utf-8');
    await rename(tmp, filePath);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

function isArchiveState(value: unknown): value is AgentMemoryArchiveState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AgentMemoryArchiveState).archivedCount === 'number' &&
    typeof (value as AgentMemoryArchiveState).archivedIdsHash === 'string' &&
    typeof (value as AgentMemoryArchiveState).archivedContentHash ===
      'string' &&
    typeof (value as AgentMemoryArchiveState).mdBytes === 'number' &&
    typeof (value as AgentMemoryArchiveState).jsonlBytes === 'number' &&
    typeof (value as AgentMemoryArchiveState).appendsSinceRewrite === 'number'
  );
}

export class AgentMemoryWriter {
  private readonly host: AgentHost;
  private readonly agentInstanceId: string;
  private archiveState: AgentMemoryArchiveState | null = null;
  private didRestoreState = false;
  private queue = Promise.resolve();

  constructor(options: AgentMemoryWriterOptions) {
    this.host = options.host;
    this.agentInstanceId = options.agentInstanceId;
  }

  public flush(options: AgentMemoryFlushOptions): Promise<void> {
    this.queue = this.queue
      .catch(() => {})
      .then(() => this.flushInternal(options));
    return this.queue;
  }

  private get memoryDir(): string {
    return this.host.paths.memoryDir();
  }

  private get agentDir(): string {
    return path.join(this.memoryDir, 'agents', this.agentInstanceId);
  }

  private get historyMarkdownPath(): string {
    return path.join(this.agentDir, 'history.md');
  }

  private get historyJsonlPath(): string {
    return path.join(this.agentDir, 'history.jsonl');
  }

  private get metadataPath(): string {
    return path.join(this.agentDir, 'metadata.json');
  }

  private async flushInternal(options: AgentMemoryFlushOptions): Promise<void> {
    try {
      await mkdir(this.agentDir, { recursive: true });
      await this.restoreArchiveState();

      let state = this.archiveState;
      if (state && !(await this.isStateValid(state, options.history))) {
        state = await this.truncateChangedTail(state, options.history);
      }
      if (!state) {
        state = await this.fullRewrite(options);
      } else if (
        options.reason === 'title' &&
        state.archivedCount === options.history.length
      ) {
        await this.writeMetadataAndIndex(options, state, new Date());
      } else if (this.shouldFullRewrite(options.reason, state)) {
        state = await this.fullRewrite(options);
      } else {
        state = await this.appendNewMessages(options, state);
      }

      this.archiveState = state;
    } catch (error) {
      this.host.logger.warn('[memory] failed to write agent memory snapshot', {
        agentInstanceId: this.agentInstanceId,
        reason: options.reason,
        error,
      });
      throw error;
    }
  }

  private async restoreArchiveState(): Promise<void> {
    if (this.didRestoreState) return;
    this.didRestoreState = true;
    try {
      const raw = await readFile(this.metadataPath, 'utf-8');
      const parsed = JSON.parse(raw) as AgentMemoryMetadata;
      const archive = parsed.archive;
      // Hashes and file sizes are validated by `flushInternal`, which can
      // still repair a changed tail message from a restored state.
      if (
        parsed.schemaVersion === SCHEMA_VERSION &&
        parsed.agentInstanceId === this.agentInstanceId &&
        isArchiveState(archive)
      ) {
        this.archiveState = archive;
      }
    } catch {
      this.archiveState = null;
    }
  }

  private async hasExpectedByteState(
    archive: AgentMemoryArchiveState,
  ): Promise<boolean> {
    try {
      const [markdownStats, jsonlStats] = await Promise.all([
        stat(this.historyMarkdownPath),
        stat(this.historyJsonlPath),
      ]);
      return (
        markdownStats.size === archive.mdBytes &&
        jsonlStats.size === archive.jsonlBytes
      );
    } catch {
      return false;
    }
  }

  private async isStateValid(
    state: AgentMemoryArchiveState,
    history: readonly AgentMessage[],
  ): Promise<boolean> {
    if (state.archivedCount > history.length) return false;
    if (
      state.archivedIdsHash !== hashMessageIds(history, state.archivedCount)
    ) {
      return false;
    }
    if (
      state.archivedContentHash !==
      (await hashMessageContent(history, state.archivedCount))
    ) {
      return false;
    }
    return this.hasExpectedByteState(state);
  }

  /**
   * The last archived message can change after it was written (streaming,
   * attachments, path references). When everything before it is unchanged,
   * cut the files back to where that message starts so it can be appended
   * again, instead of rewriting the whole archive.
   */
  private async truncateChangedTail(
    state: AgentMemoryArchiveState,
    history: readonly AgentMessage[],
  ): Promise<AgentMemoryArchiveState | null> {
    const {
      archivedCount,
      prefixIdsHash,
      prefixContentHash,
      tailMdOffset,
      tailJsonlOffset,
    } = state;
    if (
      archivedCount < 1 ||
      archivedCount > history.length ||
      prefixIdsHash === undefined ||
      prefixContentHash === undefined ||
      tailMdOffset === undefined ||
      tailJsonlOffset === undefined
    ) {
      return null;
    }
    const prefixCount = archivedCount - 1;
    if (hashMessageIds(history, prefixCount) !== prefixIdsHash) return null;
    if (
      (await hashMessageContent(history, prefixCount)) !== prefixContentHash
    ) {
      return null;
    }
    if (!(await this.hasExpectedByteState(state))) return null;

    await Promise.all([
      truncate(this.historyMarkdownPath, tailMdOffset),
      truncate(this.historyJsonlPath, tailJsonlOffset),
    ]);
    return {
      archivedCount: prefixCount,
      archivedIdsHash: prefixIdsHash,
      archivedContentHash: prefixContentHash,
      mdBytes: tailMdOffset,
      jsonlBytes: tailJsonlOffset,
      appendsSinceRewrite: state.appendsSinceRewrite,
    };
  }

  private shouldFullRewrite(
    reason: MemoryWriteReason,
    state: AgentMemoryArchiveState,
  ): boolean {
    // Edited or truncated messages are caught by the archive hash check in
    // `isStateValid`, so new user messages can be appended like any other.
    return (
      reason === 'compression' ||
      state.appendsSinceRewrite >= FORCE_REWRITE_AFTER_APPENDS
    );
  }

  private async fullRewrite(
    options: AgentMemoryFlushOptions,
  ): Promise<AgentMemoryArchiveState> {
    const serializedAt = new Date();
    const serializeOptions = {
      agentInstanceId: this.agentInstanceId,
      title: options.title,
      serializedAt,
    };
    // The last message is written as its own slice so its start offset is
    // known and it can be replaced later without a full rewrite.
    const head = options.history.slice(0, -1) as readonly WideAgentMessage[];
    const tail = options.history.slice(-1) as readonly WideAgentMessage[];
    const history = await serializeAgentMemoryHistoryChunked(
      head,
      serializeOptions,
    );
    const tailOptions = { ...serializeOptions, sequenceOffset: head.length };
    const tailMarkdown =
      tail.length > 0
        ? serializeAgentMemoryMarkdownSlice(tail, tailOptions)
        : '';
    const tailJsonl =
      tail.length > 0 ? serializeAgentMemoryJsonl(tail, tailOptions) : '';

    await Promise.all([
      writeFileAtomic(
        this.historyMarkdownPath,
        history.markdown + tailMarkdown,
      ),
      writeFileAtomic(this.historyJsonlPath, history.jsonl + tailJsonl),
      rm(path.join(this.agentDir, 'README.md'), { force: true }),
    ]);

    const state = await this.computeArchiveState(
      options.history,
      0,
      tail.length > 0
        ? {
            md: Buffer.byteLength(history.markdown),
            jsonl: Buffer.byteLength(history.jsonl),
          }
        : null,
    );
    await this.writeMetadataAndIndex(options, state, serializedAt);
    return state;
  }

  private async appendNewMessages(
    options: AgentMemoryFlushOptions,
    previousState: AgentMemoryArchiveState,
  ): Promise<AgentMemoryArchiveState> {
    if (previousState.archivedCount === options.history.length) {
      await this.writeMetadataAndIndex(options, previousState, new Date());
      return previousState;
    }

    const serializedAt = new Date();
    const newMessages = options.history.slice(
      previousState.archivedCount,
    ) as readonly WideAgentMessage[];
    const serializeOptions = {
      agentInstanceId: this.agentInstanceId,
      title: options.title,
      serializedAt,
    };
    // Serialize the last message separately to record where it starts.
    const head = newMessages.slice(0, -1);
    const tail = newMessages.slice(-1);
    const headOptions = {
      ...serializeOptions,
      sequenceOffset: previousState.archivedCount,
    };
    const tailOptions = {
      ...serializeOptions,
      sequenceOffset: previousState.archivedCount + head.length,
    };
    const headMarkdown =
      head.length > 0
        ? serializeAgentMemoryMarkdownSlice(head, headOptions)
        : '';
    const headJsonl =
      head.length > 0 ? serializeAgentMemoryJsonl(head, headOptions) : '';
    const markdown =
      headMarkdown + serializeAgentMemoryMarkdownSlice(tail, tailOptions);
    const jsonl = headJsonl + serializeAgentMemoryJsonl(tail, tailOptions);

    await Promise.all([
      appendFile(this.historyMarkdownPath, markdown, 'utf-8'),
      appendFile(this.historyJsonlPath, jsonl, 'utf-8'),
    ]);

    const state = await this.computeArchiveState(
      options.history,
      previousState.appendsSinceRewrite + 1,
      {
        md: previousState.mdBytes + Buffer.byteLength(headMarkdown),
        jsonl: previousState.jsonlBytes + Buffer.byteLength(headJsonl),
      },
    );
    await this.writeMetadataAndIndex(options, state, serializedAt);
    return state;
  }

  private async computeArchiveState(
    history: readonly AgentMessage[],
    appendsSinceRewrite: number,
    tailOffsets: TailOffsets | null,
  ): Promise<AgentMemoryArchiveState> {
    const [markdownStats, jsonlStats, contentHashes] = await Promise.all([
      stat(this.historyMarkdownPath),
      stat(this.historyJsonlPath),
      hashMessageContentWithPrefix(history, history.length),
    ]);
    const state: AgentMemoryArchiveState = {
      archivedCount: history.length,
      archivedIdsHash: hashMessageIds(history, history.length),
      archivedContentHash: contentHashes.full,
      mdBytes: markdownStats.size,
      jsonlBytes: jsonlStats.size,
      appendsSinceRewrite,
    };
    if (tailOffsets && history.length > 0) {
      state.prefixIdsHash = hashMessageIds(history, history.length - 1);
      state.prefixContentHash = contentHashes.prefix;
      state.tailMdOffset = tailOffsets.md;
      state.tailJsonlOffset = tailOffsets.jsonl;
    }
    return state;
  }

  private async writeMetadataAndIndex(
    options: AgentMemoryFlushOptions,
    archive: AgentMemoryArchiveState,
    updatedAt: Date,
  ): Promise<void> {
    const metadata = computeMetadata(
      this.agentInstanceId,
      options,
      updatedAt,
      archive,
    );
    await writeFileAtomic(
      this.metadataPath,
      `${stringifyMemoryJson(metadata, 2)}\n`,
    );
    await upsertMemoryIndexEntry(
      this.memoryDir,
      toIndexEntry(metadata),
      writeFileAtomic,
    );
  }
}

export async function writeAgentMemorySnapshot(
  options: WriteAgentMemorySnapshotOptions,
): Promise<void> {
  const queueKey = `${options.host.paths.memoryDir()}\0${options.agentInstanceId}`;
  const previous = snapshotWriteQueues.get(queueKey) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const writer = new AgentMemoryWriter({
        host: options.host,
        agentInstanceId: options.agentInstanceId,
      });
      await writer.flush({
        title: options.title,
        activeModelId: options.activeModelId,
        activeProviderInstanceId: options.activeProviderInstanceId,
        history: options.history,
        reason: options.reason,
      });
    });

  snapshotWriteQueues.set(queueKey, next);
  next
    .then(
      () => {
        if (snapshotWriteQueues.get(queueKey) === next) {
          snapshotWriteQueues.delete(queueKey);
        }
      },
      () => {
        if (snapshotWriteQueues.get(queueKey) === next) {
          snapshotWriteQueues.delete(queueKey);
        }
      },
    )
    .catch(() => {});
  await next;
}
