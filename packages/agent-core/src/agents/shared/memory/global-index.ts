import path from 'node:path';
import { readdir, readFile } from '../../../fs';
import { stringifyMemoryJson } from './serialization';
import type { AgentMemoryMetadata, AgentMemoryIndexEntry } from './index';

const INDEX_SCHEMA_VERSION = 1;
const INDEX_MARKDOWN_LIMIT = 100;

export interface MemoryIndexRegistry {
  schemaVersion: number;
  updatedAt: string;
  agents: Record<string, AgentMemoryIndexEntry>;
}

// Serializes index writes within this process; corrupt or stale indexes still
// recover by rebuilding from per-agent metadata files.
const indexQueues = new Map<string, Promise<void>>();

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isIndexEntry(value: unknown): value is AgentMemoryIndexEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AgentMemoryIndexEntry).agentInstanceId === 'string' &&
    typeof (value as AgentMemoryIndexEntry).title === 'string' &&
    typeof (value as AgentMemoryIndexEntry).activeModelId === 'string' &&
    typeof (value as AgentMemoryIndexEntry).messageCount === 'number' &&
    Number.isFinite((value as AgentMemoryIndexEntry).messageCount) &&
    isNullableString((value as AgentMemoryIndexEntry).firstMessageAt) &&
    isNullableString((value as AgentMemoryIndexEntry).lastMessageAt) &&
    typeof (value as AgentMemoryIndexEntry).updatedAt === 'string'
  );
}

function isMemoryMetadata(value: unknown): value is AgentMemoryMetadata {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AgentMemoryMetadata).agentInstanceId === 'string' &&
    typeof (value as AgentMemoryMetadata).title === 'string' &&
    typeof (value as AgentMemoryMetadata).activeModelId === 'string' &&
    typeof (value as AgentMemoryMetadata).messageCount === 'number' &&
    Number.isFinite((value as AgentMemoryMetadata).messageCount) &&
    isNullableString((value as AgentMemoryMetadata).firstMessageAt) &&
    isNullableString((value as AgentMemoryMetadata).lastMessageAt) &&
    typeof (value as AgentMemoryMetadata).updatedAt === 'string'
  );
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

async function readMemoryMetadatas(
  memoryDir: string,
): Promise<AgentMemoryMetadata[]> {
  const agentsDir = path.join(memoryDir, 'agents');
  let entries: string[] = [];
  try {
    entries = await readdir(agentsDir);
  } catch {
    return [];
  }

  const out: AgentMemoryMetadata[] = [];
  for (const agentId of entries) {
    try {
      const raw = await readFile(
        path.join(agentsDir, agentId, 'metadata.json'),
        'utf-8',
      );
      const parsed = JSON.parse(raw) as unknown;
      if (isMemoryMetadata(parsed)) out.push(parsed);
    } catch {
      // Ignore malformed or concurrently written metadata files.
    }
  }
  return out;
}

async function rebuildRegistryFromMetadata(
  memoryDir: string,
): Promise<MemoryIndexRegistry> {
  const metadatas = await readMemoryMetadatas(memoryDir);
  const agents: Record<string, AgentMemoryIndexEntry> = {};
  for (const metadata of metadatas) {
    agents[metadata.agentInstanceId] = toIndexEntry(metadata);
  }
  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    agents,
  };
}

async function readRegistry(memoryDir: string): Promise<MemoryIndexRegistry> {
  try {
    const raw = await readFile(path.join(memoryDir, 'index.json'), 'utf-8');
    const parsed = JSON.parse(raw) as MemoryIndexRegistry;
    if (
      parsed?.schemaVersion === INDEX_SCHEMA_VERSION &&
      typeof parsed.updatedAt === 'string' &&
      typeof parsed.agents === 'object' &&
      parsed.agents !== null
    ) {
      const agents: Record<string, AgentMemoryIndexEntry> = {};
      for (const entry of Object.values(parsed.agents)) {
        if (!isIndexEntry(entry)) return rebuildRegistryFromMetadata(memoryDir);
        agents[entry.agentInstanceId] = entry;
      }
      return { ...parsed, agents };
    }
  } catch {
    // Missing or corrupt index; rebuild from metadata below.
  }
  return rebuildRegistryFromMetadata(memoryDir);
}

function sanitizeMarkdownHeading(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const heading = normalized.length > 0 ? normalized : fallback;
  return heading.length > 120 ? `${heading.slice(0, 117)}...` : heading;
}

function renderGlobalIndex(registry: MemoryIndexRegistry): string {
  const entries = Object.values(registry.agents).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const visibleEntries = entries.slice(0, INDEX_MARKDOWN_LIMIT);
  const lines = [
    '# Agent Memory Index',
    '',
    `Showing ${visibleEntries.length} most recent of ${entries.length} agents.`,
    'Full registry: memory/index.json',
    '',
  ];

  if (entries.length === 0) {
    lines.push('No agent memory snapshots have been written yet.', '');
    return lines.join('\n');
  }

  for (const entry of visibleEntries) {
    const root = `memory/agents/${entry.agentInstanceId}`;
    lines.push(
      `## ${sanitizeMarkdownHeading(entry.title, entry.agentInstanceId)}`,
      '',
      `- Agent id: ${entry.agentInstanceId}`,
      `- Updated: ${entry.updatedAt}`,
      `- Messages: ${entry.messageCount}`,
      `- Markdown history: ${root}/history.md`,
      `- JSONL history: ${root}/history.jsonl`,
      '',
    );
  }
  return lines.join('\n');
}

async function upsertMemoryIndexEntryLocked(
  memoryDir: string,
  entry: AgentMemoryIndexEntry,
  writeFileAtomic: (filePath: string, content: string) => Promise<void>,
): Promise<void> {
  const registry = await readRegistry(memoryDir);
  const updatedAt = new Date().toISOString();
  const nextRegistry: MemoryIndexRegistry = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    updatedAt,
    agents: {
      ...registry.agents,
      [entry.agentInstanceId]: entry,
    },
  };

  await writeFileAtomic(
    path.join(memoryDir, 'index.json'),
    `${stringifyMemoryJson(nextRegistry, 2)}\n`,
  );
  await writeFileAtomic(
    path.join(memoryDir, 'index.md'),
    renderGlobalIndex(nextRegistry),
  );
}

export function upsertMemoryIndexEntry(
  memoryDir: string,
  entry: AgentMemoryIndexEntry,
  writeFileAtomic: (filePath: string, content: string) => Promise<void>,
): Promise<void> {
  const previous = indexQueues.get(memoryDir) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() =>
      upsertMemoryIndexEntryLocked(memoryDir, entry, writeFileAtomic),
    );
  indexQueues.set(memoryDir, next);
  return next;
}
