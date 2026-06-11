import path from 'node:path';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import type { AgentHost } from '../../../host/host';
import type { HostPaths } from '../../../host/paths';
import { createTestAgentHost } from '../../../host/test-utils';
import type { AgentMessage } from '../../../types/agent';
import { upsertMemoryIndexEntry } from './global-index';
import { AgentMemoryWriter, writeAgentMemorySnapshot } from './index';
import {
  serializeAgentMemoryHistoryChunked,
  serializeAgentMemoryJsonl,
  serializeAgentMemoryMarkdownSlice,
} from './serialization';

function makeMessage(
  id: string,
  role: AgentMessage['role'],
  text: string,
  extra: Partial<AgentMessage> = {},
): AgentMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text }],
    metadata: {
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      partsMetadata: [],
      ...(extra as { metadata?: Record<string, unknown> }).metadata,
    },
    ...extra,
  } as AgentMessage;
}

function makeHost(memoryDir: string): AgentHost {
  const noopPath = () => memoryDir;
  const paths: HostPaths = {
    dataDir: noopPath,
    tempDir: noopPath,
    agentsDir: noopPath,
    agentDir: noopPath,
    agentAttachmentsDir: noopPath,
    agentAttachmentPath: noopPath,
    agentAppsDir: noopPath,
    agentShellLogsDir: noopPath,
    diffHistoryDir: noopPath,
    diffHistoryDbPath: noopPath,
    diffHistoryBlobsDir: noopPath,
    agentDbPath: noopPath,
    fileReadCacheDbPath: noopPath,
    processedImageCacheDbPath: noopPath,
    userDataDir: noopPath,
    plansDir: noopPath,
    logsDir: noopPath,
    memoryDir: () => memoryDir,
    pluginsDir: noopPath,
    builtinSkillsDir: noopPath,
    ripgrepBaseDir: noopPath,
  };
  return createTestAgentHost({
    paths,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  });
}

async function withMemoryRoot(
  callback: (root: string, host: AgentHost) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-memory-'));
  try {
    await callback(root, makeHost(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function agentFile(root: string, agentId: string, filename: string): string {
  return path.join(root, 'agents', agentId, filename);
}

async function readMetadata(root: string, agentId = 'agent-1') {
  return JSON.parse(
    await readFile(agentFile(root, agentId, 'metadata.json'), 'utf-8'),
  );
}

async function writeFileAtomic(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

describe('agent memory serialization', () => {
  it('includes full text from multiple messages', async () => {
    const { markdown } = await serializeAgentMemoryHistoryChunked(
      [
        makeMessage('u1', 'user', 'first full text'),
        makeMessage('a1', 'assistant', 'second full text'),
      ],
      { agentInstanceId: 'agent-1', title: 'Test' },
    );
    expect(markdown).toContain('# Agent Memory');
    expect(markdown).toContain('Agent instance: agent-1');
    expect(markdown).not.toContain('Messages: 2');
    expect(markdown).toContain('first full text');
    expect(markdown).toContain('second full text');
    expect(markdown).toContain('Message 1: user');
    expect(markdown).toContain('Message 2: assistant');
  });

  it('includes tool input and output details', async () => {
    const message = makeMessage('a1', 'assistant', '', {
      parts: [
        {
          type: 'tool-read',
          toolCallId: 'tc1',
          state: 'output-available',
          input: { path: 'w/a.txt' },
          output: { message: 'File opened' },
        },
      ] as never,
    });
    const { markdown } = await serializeAgentMemoryHistoryChunked([message], {
      agentInstanceId: 'agent-1',
    });
    expect(markdown).toContain('tool-read');
    expect(markdown).toContain('tc1');
    expect(markdown).toContain('w/a.txt');
    expect(markdown).toContain('File opened');
  });

  it('preserves compressed history as metadata without dropping messages', async () => {
    const { markdown } = await serializeAgentMemoryHistoryChunked(
      [
        makeMessage('u1', 'user', 'before'),
        makeMessage('u2', 'user', 'boundary', {
          metadata: {
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            partsMetadata: [],
            compressedHistory: 'compressed summary',
          },
        }),
      ],
      { agentInstanceId: 'agent-1' },
    );
    expect(markdown).toContain('before');
    expect(markdown).toContain('boundary');
    expect(markdown).toContain('compressed summary');
  });

  it('emits one valid JSONL line per message', () => {
    const jsonl = serializeAgentMemoryJsonl(
      [makeMessage('u1', 'user', 'one'), makeMessage('a1', 'assistant', 'two')],
      { agentInstanceId: 'agent-1' },
    );
    const lines = jsonl.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => JSON.parse(line).sequence)).toEqual([1, 2]);
  });

  it('supports sequence offsets for appended slices', () => {
    const markdown = serializeAgentMemoryMarkdownSlice(
      [makeMessage('a3', 'assistant', 'three')],
      { agentInstanceId: 'agent-1', sequenceOffset: 2 },
    );
    const jsonl = serializeAgentMemoryJsonl(
      [makeMessage('a3', 'assistant', 'three')],
      {
        agentInstanceId: 'agent-1',
        sequenceOffset: 2,
      },
    );
    expect(markdown).not.toContain('# Agent Memory');
    expect(markdown).toContain('Message 3: assistant');
    expect(JSON.parse(jsonl.trim()).sequence).toBe(3);
  });

  it('handles circular values in JSONL', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const message = makeMessage('u1', 'user', 'one', {
      metadata: {
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        partsMetadata: [],
        circular,
      } as never,
    });
    const jsonl = serializeAgentMemoryJsonl([message], {
      agentInstanceId: 'agent-1',
    });
    expect(jsonl).toContain('[Circular]');
  });

  it('does not treat repeated non-cyclic references as circular', () => {
    const shared = { shared: 'value' };
    const message = makeMessage('u1', 'user', 'one', {
      metadata: {
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        partsMetadata: [shared, shared] as never,
      },
      parts: [
        { type: 'text', text: 'one', first: shared, second: shared },
      ] as never,
    });
    const jsonl = serializeAgentMemoryJsonl([message], {
      agentInstanceId: 'agent-1',
    });
    expect(jsonl).not.toContain('[Circular]');
    expect(jsonl.match(/"shared":"value"/g)).toHaveLength(4);
  });

  it('ignores primitive metadata while rendering markdown', async () => {
    const { markdown } = await serializeAgentMemoryHistoryChunked(
      [
        makeMessage('u1', 'user', 'one', {
          metadata: 'not-object' as never,
        }),
      ],
      { agentInstanceId: 'agent-1' },
    );
    expect(markdown).toContain('Message 1: user');
    expect(markdown).toContain('one');
  });
});

describe('agent memory writer', () => {
  it('creates per-agent files and global index', async () => {
    await withMemoryRoot(async (root, host) => {
      await writeAgentMemorySnapshot({
        host,
        agentInstanceId: 'agent-1',
        title: 'Agent One',
        activeModelId: 'model-a',
        history: [makeMessage('u1', 'user', 'hello')],
        reason: 'user-message',
      });

      for (const filename of ['history.md', 'history.jsonl', 'metadata.json']) {
        await expect(
          readFile(agentFile(root, 'agent-1', filename), 'utf-8'),
        ).resolves.toBeTruthy();
      }

      const metadata = await readMetadata(root);
      expect(metadata.schemaVersion).toBe(2);
      expect(metadata.archive.archivedCount).toBe(1);

      const index = await readFile(path.join(root, 'index.md'), 'utf-8');
      expect(index).toContain('Showing 1 most recent of 1 agents.');
      expect(index).toContain('Full registry: memory/index.json');
      expect(index).toContain('Agent One');
      expect(index).toContain('memory/agents/agent-1/history.md');
      const registry = JSON.parse(
        await readFile(path.join(root, 'index.json'), 'utf-8'),
      );
      expect(registry.agents['agent-1'].title).toBe('Agent One');
    });
  });

  it('rebuilds malformed existing index entries while upserting', async () => {
    await withMemoryRoot(async (root) => {
      await mkdir(path.join(root, 'agents', 'valid'), { recursive: true });
      await writeFile(
        agentFile(root, 'valid', 'metadata.json'),
        JSON.stringify({
          schemaVersion: 2,
          agentInstanceId: 'valid',
          title: 'Valid From Metadata',
          activeModelId: 'model-a',
          messageCount: 1,
          firstMessageAt: null,
          lastMessageAt: null,
          updatedAt: '2025-01-01T00:00:00.000Z',
          reason: 'user-message',
        }),
        'utf-8',
      );
      await writeFile(
        path.join(root, 'index.json'),
        JSON.stringify({
          schemaVersion: 1,
          updatedAt: '2025-01-01T00:00:00.000Z',
          agents: {
            valid: {
              agentInstanceId: 'valid',
              title: 'Stale Valid',
              activeModelId: 'model-a',
              messageCount: 1,
              firstMessageAt: null,
              lastMessageAt: null,
              updatedAt: '2025-01-01T00:00:00.000Z',
            },
            invalid: {
              agentInstanceId: 'invalid',
            },
          },
        }),
        'utf-8',
      );

      await upsertMemoryIndexEntry(
        root,
        {
          agentInstanceId: 'agent-1',
          title: 'Agent One',
          activeModelId: 'model-a',
          messageCount: 2,
          firstMessageAt: null,
          lastMessageAt: null,
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
        writeFileAtomic,
      );

      const registry = JSON.parse(
        await readFile(path.join(root, 'index.json'), 'utf-8'),
      );
      expect(Object.keys(registry.agents).sort()).toEqual(['agent-1', 'valid']);
      expect(registry.agents.valid.title).toBe('Valid From Metadata');
      expect(registry.agents.invalid).toBeUndefined();
    });
  });

  it('ignores malformed metadata while rebuilding the global index', async () => {
    await withMemoryRoot(async (root) => {
      await mkdir(path.join(root, 'agents', 'valid'), { recursive: true });
      await mkdir(path.join(root, 'agents', 'invalid'), { recursive: true });
      await writeFile(
        agentFile(root, 'valid', 'metadata.json'),
        JSON.stringify({
          schemaVersion: 2,
          agentInstanceId: 'valid',
          title: 'Valid',
          activeModelId: 'model-a',
          messageCount: 1,
          firstMessageAt: null,
          lastMessageAt: null,
          updatedAt: '2025-01-01T00:00:00.000Z',
          reason: 'user-message',
        }),
        'utf-8',
      );
      await writeFile(
        agentFile(root, 'invalid', 'metadata.json'),
        JSON.stringify({ agentInstanceId: 'invalid' }),
        'utf-8',
      );

      await upsertMemoryIndexEntry(
        root,
        {
          agentInstanceId: 'agent-1',
          title: 'Agent One',
          activeModelId: 'model-a',
          messageCount: 2,
          firstMessageAt: null,
          lastMessageAt: null,
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
        writeFileAtomic,
      );

      const registry = JSON.parse(
        await readFile(path.join(root, 'index.json'), 'utf-8'),
      );
      expect(Object.keys(registry.agents).sort()).toEqual(['agent-1', 'valid']);
      const index = await readFile(path.join(root, 'index.md'), 'utf-8');
      expect(index).toContain('Agent One');
      expect(index).toContain('Valid');
      expect(index).not.toContain('invalid');
    });
  });

  it('appends new post-step messages without duplicating content', async () => {
    await withMemoryRoot(async (root, host) => {
      const writer = new AgentMemoryWriter({
        host,
        agentInstanceId: 'agent-1',
      });
      const history = [makeMessage('u1', 'user', 'one')];
      await writer.flush({
        title: 'Agent One',
        activeModelId: 'model-a',
        history,
        reason: 'user-message',
      });

      history.push(makeMessage('a1', 'assistant', 'two'));
      await writer.flush({
        title: 'Agent One',
        activeModelId: 'model-a',
        history,
        reason: 'post-step',
      });

      const markdown = await readFile(
        agentFile(root, 'agent-1', 'history.md'),
        'utf-8',
      );
      expect(markdown.match(/# Agent Memory/g)).toHaveLength(1);
      expect(markdown.match(/Message 1: user/g)).toHaveLength(1);
      expect(markdown.match(/Message 2: assistant/g)).toHaveLength(1);
      const jsonl = await readFile(
        agentFile(root, 'agent-1', 'history.jsonl'),
        'utf-8',
      );
      expect(
        jsonl
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line).sequence),
      ).toEqual([1, 2]);
      expect((await readMetadata(root)).archive.appendsSinceRewrite).toBe(1);
    });
  });

  it('rewrites on full-rewrite reasons and mutation detection', async () => {
    await withMemoryRoot(async (root, host) => {
      const writer = new AgentMemoryWriter({
        host,
        agentInstanceId: 'agent-1',
      });
      let history = [makeMessage('u1', 'user', 'one')];
      await writer.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'user-message',
      });
      history.push(makeMessage('a1', 'assistant', 'two'));
      await writer.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'post-step',
      });
      await writer.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'compression',
      });
      expect((await readMetadata(root)).archive.appendsSinceRewrite).toBe(0);

      history.push(makeMessage('u2', 'user', 'three'));
      await writer.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'post-step',
      });
      await writer.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'user-message',
      });
      expect((await readMetadata(root)).archive.appendsSinceRewrite).toBe(0);

      history = [
        makeMessage('replacement', 'user', 'changed'),
        ...history.slice(1),
      ];
      await writer.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'post-step',
      });
      expect((await readMetadata(root)).archive.appendsSinceRewrite).toBe(0);

      history = [
        makeMessage('replacement', 'user', 'content-only change'),
        ...history.slice(1),
      ];
      await writer.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'post-step',
      });
      expect((await readMetadata(root)).archive.appendsSinceRewrite).toBe(0);
      expect(
        await readFile(agentFile(root, 'agent-1', 'history.md'), 'utf-8'),
      ).toContain('content-only change');

      await truncate(agentFile(root, 'agent-1', 'history.md'), 5);
      await writer.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'post-step',
      });
      const markdown = await readFile(
        agentFile(root, 'agent-1', 'history.md'),
        'utf-8',
      );
      expect(markdown).toContain('content-only change');
      expect((await readMetadata(root)).archive.appendsSinceRewrite).toBe(0);
    });
  });

  it('forces a self-healing rewrite after 20 appends', async () => {
    await withMemoryRoot(async (root, host) => {
      const writer = new AgentMemoryWriter({
        host,
        agentInstanceId: 'agent-1',
      });
      const history = [makeMessage('m0', 'user', '0')];
      await writer.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'user-message',
      });
      for (let index = 1; index <= 22; index++) {
        history.push(makeMessage(`m${index}`, 'assistant', String(index)));
        await writer.flush({
          title: 'A',
          activeModelId: 'm',
          history,
          reason: 'post-step',
        });
      }
      expect((await readMetadata(root)).archive.appendsSinceRewrite).toBe(1);
    });
  });

  it('resumes appends after restart and re-baselines invalid state', async () => {
    await withMemoryRoot(async (root, host) => {
      const history = [makeMessage('u1', 'user', 'one')];
      const firstWriter = new AgentMemoryWriter({
        host,
        agentInstanceId: 'agent-1',
      });
      await firstWriter.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'user-message',
      });

      history.push(makeMessage('a1', 'assistant', 'two'));
      const restartedWriter = new AgentMemoryWriter({
        host,
        agentInstanceId: 'agent-1',
      });
      await restartedWriter.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'post-step',
      });
      expect((await readMetadata(root)).archive.appendsSinceRewrite).toBe(1);

      await truncate(agentFile(root, 'agent-1', 'history.jsonl'), 2);
      history.push(makeMessage('u2', 'user', 'three'));
      const invalidStateWriter = new AgentMemoryWriter({
        host,
        agentInstanceId: 'agent-1',
      });
      await invalidStateWriter.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'post-step',
      });
      expect((await readMetadata(root)).archive.appendsSinceRewrite).toBe(0);
      const jsonl = await readFile(
        agentFile(root, 'agent-1', 'history.jsonl'),
        'utf-8',
      );
      expect(jsonl.trim().split('\n')).toHaveLength(3);
    });
  });

  it('updates metadata and index only for title changes', async () => {
    await withMemoryRoot(async (root, host) => {
      const writer = new AgentMemoryWriter({
        host,
        agentInstanceId: 'agent-1',
      });
      const history = [makeMessage('u1', 'user', 'one')];
      await writer.flush({
        title: 'Old',
        activeModelId: 'm',
        history,
        reason: 'user-message',
      });
      const before = await readFile(
        agentFile(root, 'agent-1', 'history.md'),
        'utf-8',
      );
      await writer.flush({
        title: 'New',
        activeModelId: 'm',
        history,
        reason: 'title',
      });
      const after = await readFile(
        agentFile(root, 'agent-1', 'history.md'),
        'utf-8',
      );
      expect(after).toBe(before);
      expect((await readMetadata(root)).title).toBe('New');
      const index = await readFile(path.join(root, 'index.md'), 'utf-8');
      expect(index).toContain('New');
    });
  });

  it('sanitizes index markdown headings without changing registry titles', async () => {
    await withMemoryRoot(async (root, host) => {
      const rawTitle = 'Good title\n## Injected heading';
      await writeAgentMemorySnapshot({
        host,
        agentInstanceId: 'agent-1',
        title: rawTitle,
        activeModelId: 'model-a',
        history: [makeMessage('u1', 'user', 'hello')],
        reason: 'user-message',
      });

      const registry = JSON.parse(
        await readFile(path.join(root, 'index.json'), 'utf-8'),
      );
      expect(registry.agents['agent-1'].title).toBe(rawTitle);

      const indexMd = await readFile(path.join(root, 'index.md'), 'utf-8');
      expect(indexMd).toContain('## Good title ## Injected heading');
      expect(indexMd.match(/^## /gm)).toHaveLength(1);
      expect(indexMd).not.toContain('\n## Injected heading');
    });
  });

  it('serializes concurrent snapshot helper writes for one agent', async () => {
    await withMemoryRoot(async (root, host) => {
      await Promise.all(
        Array.from({ length: 5 }, async (_, index) => {
          await writeAgentMemorySnapshot({
            host,
            agentInstanceId: 'agent-1',
            title: `Agent ${index}`,
            activeModelId: 'model-a',
            history: Array.from({ length: index + 1 }, (__, messageIndex) =>
              makeMessage(
                `u${messageIndex}`,
                'user',
                `message ${messageIndex}`,
              ),
            ),
            reason: 'user-message',
          });
        }),
      );

      const metadata = await readMetadata(root);
      expect(metadata.title).toBe('Agent 4');
      expect(metadata.messageCount).toBe(5);
      expect(metadata.archive.archivedCount).toBe(5);
      const history = await readFile(
        agentFile(root, 'agent-1', 'history.md'),
        'utf-8',
      );
      expect(history).toContain('message 4');
    });
  });

  it('registry preserves entries, recovers from corruption, and caps markdown', async () => {
    await withMemoryRoot(async (root, host) => {
      for (let index = 0; index < 120; index++) {
        await writeAgentMemorySnapshot({
          host,
          agentInstanceId: `agent-${index}`,
          title: `Agent ${index}`,
          activeModelId: 'model-a',
          history: [makeMessage(`u${index}`, 'user', `hello ${index}`)],
          reason: 'user-message',
        });
      }
      const registry = JSON.parse(
        await readFile(path.join(root, 'index.json'), 'utf-8'),
      );
      expect(Object.keys(registry.agents)).toHaveLength(120);
      const indexMd = await readFile(path.join(root, 'index.md'), 'utf-8');
      expect(indexMd).toContain('Showing 100 most recent of 120 agents.');
      expect(indexMd.match(/^## Agent /gm)).toHaveLength(100);

      await writeFile(path.join(root, 'index.json'), '{bad json', 'utf-8');
      await writeAgentMemorySnapshot({
        host,
        agentInstanceId: 'agent-120',
        title: 'Agent 120',
        activeModelId: 'model-a',
        history: [makeMessage('u120', 'user', 'hello 120')],
        reason: 'user-message',
      });
      const recovered = JSON.parse(
        await readFile(path.join(root, 'index.json'), 'utf-8'),
      );
      expect(Object.keys(recovered.agents)).toHaveLength(121);
    });
  });

  it('keeps second flush bounded for large histories', async () => {
    await withMemoryRoot(async (root, host) => {
      const writer = new AgentMemoryWriter({
        host,
        agentInstanceId: 'agent-1',
      });
      const history = Array.from({ length: 2500 }, (_, index) =>
        makeMessage(
          `m${index}`,
          index % 2 === 0 ? 'user' : 'assistant',
          String(index),
        ),
      );
      await writer.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'user-message',
      });
      const before = (await readMetadata(root)).archive.mdBytes;
      history.push(makeMessage('m2500', 'assistant', '2500'));
      await writer.flush({
        title: 'A',
        activeModelId: 'm',
        history,
        reason: 'post-step',
      });
      const after = await readMetadata(root);
      expect(after.archive.archivedCount).toBe(2501);
      expect(after.archive.mdBytes - before).toBeLessThan(2000);
    });
  });
});
