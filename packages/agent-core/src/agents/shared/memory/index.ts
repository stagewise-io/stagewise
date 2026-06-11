import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
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

const SCHEMA_VERSION = 2;
const FORCE_REWRITE_AFTER_APPENDS = 20;
const snapshotWriteQueues = new Map<string, Promise<void>>();

export interface AgentMemoryWriterOptions {
  host: AgentHost;
  agentInstanceId: string;
}

export interface WriteAgentMemorySnapshotOptions {
  host: AgentHost;
  agentInstanceId: string;
  title: string;
  activeModelId: string;
  history: readonly AgentMessage[];
  reason: MemoryWriteReason;
}

export interface AgentMemoryFlushOptions {
  title: string;
  activeModelId: string;
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
}

export interface AgentMemoryMetadata {
  schemaVersion: number;
  agentInstanceId: string;
  title: string;
  activeModelId: string;
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

function hashArchivedMessages(
  history: readonly AgentMessage[],
  count: number,
  mode: 'ids' | 'content',
): string {
  const hash = createHash('sha256');
  for (let index = 0; index < count; index++) {
    const message = history[index];
    if (mode === 'ids') {
      hash.update(message?.id ?? '');
    } else {
      hash.update(stringifyMemoryJson(message ?? null));
    }
    hash.update('\n');
  }
  return hash.digest('hex');
}

function hashMessageIds(
  history: readonly AgentMessage[],
  count: number,
): string {
  return hashArchivedMessages(history, count, 'ids');
}

function hashMessageContent(
  history: readonly AgentMessage[],
  count: number,
): string {
  return hashArchivedMessages(history, count, 'content');
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
      await this.restoreArchiveState(options.history);

      let state = this.archiveState;
      if (!state || !(await this.isStateValid(state, options.history))) {
        state = await this.fullRewrite(options);
      } else if (options.reason === 'title') {
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

  private async restoreArchiveState(
    history: readonly AgentMessage[],
  ): Promise<void> {
    if (this.didRestoreState) return;
    this.didRestoreState = true;
    try {
      const raw = await readFile(this.metadataPath, 'utf-8');
      const parsed = JSON.parse(raw) as AgentMemoryMetadata;
      const archive = parsed.archive;
      if (
        parsed.schemaVersion === SCHEMA_VERSION &&
        parsed.agentInstanceId === this.agentInstanceId &&
        isArchiveState(archive) &&
        archive.archivedCount <= history.length &&
        archive.archivedIdsHash ===
          hashMessageIds(history, archive.archivedCount) &&
        archive.archivedContentHash ===
          hashMessageContent(history, archive.archivedCount) &&
        (await this.hasExpectedByteState(archive))
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
      hashMessageContent(history, state.archivedCount)
    ) {
      return false;
    }
    return this.hasExpectedByteState(state);
  }

  private shouldFullRewrite(
    reason: MemoryWriteReason,
    state: AgentMemoryArchiveState,
  ): boolean {
    return (
      reason === 'compression' ||
      reason === 'user-message' ||
      state.appendsSinceRewrite >= FORCE_REWRITE_AFTER_APPENDS
    );
  }

  private async fullRewrite(
    options: AgentMemoryFlushOptions,
  ): Promise<AgentMemoryArchiveState> {
    const serializedAt = new Date();
    const history = await serializeAgentMemoryHistoryChunked(
      options.history as readonly WideAgentMessage[],
      {
        agentInstanceId: this.agentInstanceId,
        title: options.title,
        serializedAt,
      },
    );

    await Promise.all([
      writeFileAtomic(this.historyMarkdownPath, history.markdown),
      writeFileAtomic(this.historyJsonlPath, history.jsonl),
      rm(path.join(this.agentDir, 'README.md'), { force: true }),
    ]);

    const state = await this.computeArchiveState(options.history, 0);
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
    const newMessages = options.history.slice(previousState.archivedCount);
    const markdown = serializeAgentMemoryMarkdownSlice(
      newMessages as readonly WideAgentMessage[],
      {
        agentInstanceId: this.agentInstanceId,
        title: options.title,
        serializedAt,
        sequenceOffset: previousState.archivedCount,
      },
    );
    const jsonl = serializeAgentMemoryJsonl(
      newMessages as readonly WideAgentMessage[],
      {
        agentInstanceId: this.agentInstanceId,
        title: options.title,
        serializedAt,
        sequenceOffset: previousState.archivedCount,
      },
    );

    await Promise.all([
      appendFile(this.historyMarkdownPath, markdown, 'utf-8'),
      appendFile(this.historyJsonlPath, jsonl, 'utf-8'),
    ]);

    const state = await this.computeArchiveState(
      options.history,
      previousState.appendsSinceRewrite + 1,
    );
    await this.writeMetadataAndIndex(options, state, serializedAt);
    return state;
  }

  private async computeArchiveState(
    history: readonly AgentMessage[],
    appendsSinceRewrite: number,
  ): Promise<AgentMemoryArchiveState> {
    const [markdownStats, jsonlStats] = await Promise.all([
      stat(this.historyMarkdownPath),
      stat(this.historyJsonlPath),
    ]);
    return {
      archivedCount: history.length,
      archivedIdsHash: hashMessageIds(history, history.length),
      archivedContentHash: hashMessageContent(history, history.length),
      mdBytes: markdownStats.size,
      jsonlBytes: jsonlStats.size,
      appendsSinceRewrite,
    };
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
