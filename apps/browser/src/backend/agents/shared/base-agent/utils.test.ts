import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import nodeFs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import type {
  EnvironmentSnapshot,
  FullEnvironmentSnapshot,
} from '@shared/karton-contracts/ui/agent/metadata';
import type { UserMessageMetadata } from '@shared/karton-contracts/ui/agent/metadata';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import { convertAgentMessagesToModelMessages } from './utils';
import {
  resolveEffectiveSnapshot,
  sparsifySnapshot,
} from '../prompts/utils/environment-changes';
import { FileReadCacheService } from '@/services/file-read-cache';

function makeSnapshot(
  overrides: Partial<FullEnvironmentSnapshot> = {},
): FullEnvironmentSnapshot {
  return {
    browser: {
      tabs: [{ id: '1', url: 'https://a.com', title: 'A' }],
      activeTabId: '1',
    },
    workspace: {
      mounts: [{ prefix: 'w1', path: '/project' }],
    },
    fileDiffs: { pending: [], summary: [] },
    sandboxSessionId: 'test-session-id',
    activeApp: null,
    agentsMd: { entries: [], respectedMounts: [] },
    workspaceMd: { entries: [] },
    enabledSkills: { paths: [] },
    browserSessionId: 'test-browser-session-id',
    plans: { entries: [] },
    ...overrides,
  };
}

function makeMetadata(snapshot?: EnvironmentSnapshot): UserMessageMetadata {
  return {
    createdAt: new Date(),
    partsMetadata: [],
    environmentSnapshot: snapshot,
  };
}

function makeUserMsg(
  id: string,
  text: string,
  snapshot?: EnvironmentSnapshot,
): AgentMessage & { role: 'user' } {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
    metadata: makeMetadata(snapshot),
  } as AgentMessage & { role: 'user' };
}

function makeAssistantMsg(
  id: string,
  text: string,
  snapshot?: EnvironmentSnapshot,
): AgentMessage {
  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text, state: 'done' }],
    metadata: makeMetadata(snapshot),
  } as AgentMessage;
}

/**
 * Extract all text from a user model message's content array.
 */
function getUserMsgTexts(msg: any): string[] {
  const content = Array.isArray(msg.content)
    ? msg.content
    : [{ type: 'text', text: msg.content }];
  return content
    .filter((p: any) => p.type === 'text' && typeof p.text === 'string')
    .map((p: any) => p.text as string);
}

function hasEnvSnapshot(msg: any): boolean {
  return getUserMsgTexts(msg).some((t) => t.includes('<env-snapshot>'));
}

function hasEnvChanges(msg: any): boolean {
  return getUserMsgTexts(msg).some((t) => t.includes('<env-changes>'));
}

const noopBlobReader = async () => Buffer.alloc(0);

describe('convertAgentMessagesToModelMessages – env context injection', () => {
  const agentId = 'agent-1';

  it('first user message gets <env-snapshot>', async () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap),
      makeAssistantMsg('a1', 'hi there', snap),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'system prompt',
      {},
      agentId,
      noopBlobReader,
    );

    const userMessages = result.filter((m) => m.role === 'user');
    expect(hasEnvSnapshot(userMessages[0])).toBe(true);
    expect(hasEnvChanges(userMessages[0])).toBe(false);
  });

  it('does not inject env-changes when snapshots are identical', async () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap),
      makeAssistantMsg('a1', 'hi there', snap),
      makeUserMsg('u2', 'next', snap),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'system prompt',
      {},
      agentId,
      noopBlobReader,
    );

    const userMessages = result.filter((m) => m.role === 'user');
    // Second user message should NOT have env-changes
    expect(hasEnvChanges(userMessages[1])).toBe(false);
  });

  it('injects env-changes into user message when snapshot changed', async () => {
    const snap1 = makeSnapshot();
    const snap2 = makeSnapshot({
      workspace: {
        mounts: [],
      },
    });
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap1),
      makeAssistantMsg('a1', 'response', snap1),
      makeUserMsg('u2', 'next question', snap2),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'system prompt',
      {},
      agentId,
      noopBlobReader,
    );

    const userMessages = result.filter((m) => m.role === 'user');
    // First user message gets env-snapshot
    expect(hasEnvSnapshot(userMessages[0])).toBe(true);
    // Second user message gets env-changes (merged in)
    expect(hasEnvChanges(userMessages[1])).toBe(true);
    const texts = getUserMsgTexts(userMessages[1]);
    expect(
      texts.some((t) => t.includes('<workspace-unmounted') && t.includes('w1')),
    ).toBe(true);
  });

  it('env-changes come before <user-msg> in content', async () => {
    const snap1 = makeSnapshot();
    const snap2 = makeSnapshot({
      workspace: { mounts: [] },
    });
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap1),
      makeAssistantMsg('a1', 'hi', snap1),
      makeUserMsg('u2', 'bye', snap2),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'system prompt',
      {},
      agentId,
      noopBlobReader,
    );

    const secondUser = result.filter((m) => m.role === 'user')[1];
    const texts = getUserMsgTexts(secondUser);
    const envIdx = texts.findIndex((t) => t.includes('<env-changes>'));
    const userMsgIdx = texts.findIndex((t) => t.includes('<user-msg'));
    expect(envIdx).toBeGreaterThan(-1);
    expect(userMsgIdx).toBeGreaterThan(-1);
    expect(envIdx).toBeLessThan(userMsgIdx);
  });

  it('injects multiple env-changes for multiple snapshot transitions', async () => {
    const snap1 = makeSnapshot();
    const snap2 = makeSnapshot({
      browser: {
        tabs: [],
        activeTabId: null,
      },
    });
    const snap3 = makeSnapshot({
      browser: {
        tabs: [
          {
            id: '5',
            url: 'https://new.com',
            title: 'New',
          },
        ],
        activeTabId: '5',
      },
    });
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap1),
      makeAssistantMsg('a1', 'first', snap2),
      makeUserMsg('u2', 'next', snap3),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'system prompt',
      {},
      agentId,
      noopBlobReader,
    );

    const userMessages = result.filter((m) => m.role === 'user');
    // First user gets env-snapshot
    expect(hasEnvSnapshot(userMessages[0])).toBe(true);
    // Second user gets env-changes (snap1->snap3 effective change)
    expect(hasEnvChanges(userMessages[1])).toBe(true);
  });

  it('does not inject when snapshots are missing', async () => {
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello'),
      makeAssistantMsg('a1', 'hi'),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'system prompt',
      {},
      agentId,
      noopBlobReader,
    );

    const userMessages = result.filter((m) => m.role === 'user');
    expect(hasEnvSnapshot(userMessages[0])).toBe(false);
    expect(hasEnvChanges(userMessages[0])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// File injection integration tests (Issue 10)
// ---------------------------------------------------------------------------

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {},
  verboseMode: false,
} as any;

function sha256(content: string | Buffer): string {
  return createHash('sha256')
    .update(typeof content === 'string' ? Buffer.from(content) : content)
    .digest('hex');
}

interface FileInjectionTestContext {
  cache: FileReadCacheService;
  workDir: string;
  mountPrefix: string;
  mountPaths: Map<string, string>;
  agentId: string;
  blobReader: (agentId: string, mountedPath: string) => Promise<Buffer>;
}

async function setupFileInjection(): Promise<FileInjectionTestContext> {
  const id = randomUUID().slice(0, 8);
  const workDir = path.join(os.tmpdir(), 'utils-fi-tests', id);
  await nodeFs.mkdir(workDir, { recursive: true });

  const mountPrefix = `w${id.slice(0, 3)}`;
  const agentId = `agent-${id}`;

  const cache = await FileReadCacheService.createWithUrl(
    `file:${path.join(os.tmpdir(), 'utils-fi-tests', `${id}.sqlite`)}`,
    noopLogger,
  );

  const mountPaths = new Map([[mountPrefix, workDir]]);

  const blobReader = async (
    _agentId: string,
    mountedPath: string,
  ): Promise<Buffer> => {
    const slashIdx = mountedPath.indexOf('/');
    if (slashIdx <= 0) throw new Error(`Invalid path: ${mountedPath}`);
    const prefix = mountedPath.slice(0, slashIdx);
    const relative = mountedPath.slice(slashIdx + 1);
    const root = mountPaths.get(prefix);
    if (!root) throw new Error(`Unknown mount: ${prefix}`);
    return nodeFs.readFile(path.join(root, relative));
  };

  return { cache, workDir, mountPrefix, mountPaths, agentId, blobReader };
}

async function teardownFileInjection(
  ctx: FileInjectionTestContext,
): Promise<void> {
  await ctx.cache.teardown();
}

describe('convertAgentMessagesToModelMessages – file injection via pathReferences', () => {
  let ctx: FileInjectionTestContext;

  beforeEach(async () => {
    ctx = await setupFileInjection();
  });
  afterEach(async () => {
    await teardownFileInjection(ctx);
  });

  it('injects file content from user message pathReferences', async () => {
    const content = 'export const foo = 42;\n';
    const filePath = path.join(ctx.workDir, 'foo.ts');
    await nodeFs.writeFile(filePath, content);
    const hash = sha256(content);

    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      {
        ...makeUserMsg('u1', 'check this file', snap),
        metadata: {
          ...makeMetadata(snap),
          pathReferences: {
            [`${ctx.mountPrefix}/foo.ts`]: hash,
          },
        },
      } as AgentMessage,
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'system prompt',
      {},
      ctx.agentId,
      ctx.blobReader,
      undefined,
      undefined,
      undefined,
      noopLogger,
      undefined,
      undefined,
      ctx.cache,
      ctx.mountPaths,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const texts = getUserMsgTexts(userMsg);
    const allText = texts.join('');
    // File content should be injected wrapped in <file> XML
    expect(allText).toContain('<file path=');
    expect(allText).toContain('foo.ts');
    expect(allText).toContain(content);
    // File content should appear BEFORE user-msg
    const fileIdx = allText.indexOf('<file path=');
    const userMsgIdx = allText.indexOf('<user-msg');
    expect(fileIdx).toBeLessThan(userMsgIdx);
  });

  it('deduplicates identical (path, hash) across messages', async () => {
    const content = 'export const bar = 1;\n';
    await nodeFs.writeFile(path.join(ctx.workDir, 'bar.ts'), content);
    const hash = sha256(content);
    const refKey = `${ctx.mountPrefix}/bar.ts`;

    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      {
        ...makeUserMsg('u1', 'first', snap),
        metadata: {
          ...makeMetadata(snap),
          pathReferences: { [refKey]: hash },
        },
      } as AgentMessage,
      makeAssistantMsg('a1', 'ok', snap),
      {
        ...makeUserMsg('u2', 'again', snap),
        metadata: {
          ...makeMetadata(snap),
          pathReferences: { [refKey]: hash },
        },
      } as AgentMessage,
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      ctx.agentId,
      ctx.blobReader,
      undefined,
      undefined,
      undefined,
      noopLogger,
      undefined,
      undefined,
      ctx.cache,
      ctx.mountPaths,
    );

    // Count <file> occurrences — should appear only once (first user message)
    const allTexts = result.flatMap((m) =>
      m.role === 'user' ? getUserMsgTexts(m) : [],
    );
    const fileOccurrences = allTexts.filter((t) =>
      t.includes(`<file path=`),
    ).length;
    expect(fileOccurrences).toBe(1);
  });

  it('re-injects file when hash changes between messages', async () => {
    const content1 = 'version 1';
    const content2 = 'version 2';
    const filePath = path.join(ctx.workDir, 'changing.ts');
    await nodeFs.writeFile(filePath, content2); // current disk state is v2
    const hash1 = sha256(content1);
    const hash2 = sha256(content2);
    const refKey = `${ctx.mountPrefix}/changing.ts`;

    // Pre-populate cache with v1 content so the mismatch path returns it
    const { serializeTransformResult } = await import(
      './file-read-transformer/serialization'
    );
    const ext = '.ts';
    const cacheKey1 = FileReadCacheService.buildCacheKey(hash1, ext);
    await ctx.cache.set(
      cacheKey1,
      serializeTransformResult({
        metadata: { size: '9B' },
        parts: [{ type: 'text', text: content1 }],
      }),
      content1.length,
    );

    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      {
        ...makeUserMsg('u1', 'first version', snap),
        metadata: {
          ...makeMetadata(snap),
          pathReferences: { [refKey]: hash1 },
        },
      } as AgentMessage,
      makeAssistantMsg('a1', 'ok', snap),
      {
        ...makeUserMsg('u2', 'updated version', snap),
        metadata: {
          ...makeMetadata(snap),
          pathReferences: { [refKey]: hash2 },
        },
      } as AgentMessage,
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      ctx.agentId,
      ctx.blobReader,
      undefined,
      undefined,
      undefined,
      noopLogger,
      undefined,
      undefined,
      ctx.cache,
      ctx.mountPaths,
    );

    // Both versions should be injected (different hashes = different content)
    const allTexts = result.flatMap((m) =>
      m.role === 'user' ? getUserMsgTexts(m) : [],
    );
    const fileOccurrences = allTexts.filter((t) =>
      t.includes(`<file path=`),
    ).length;
    expect(fileOccurrences).toBe(2);
  });

  it('injects file content from assistant message pathReferences as synthetic user message', async () => {
    const content = 'assistant read this';
    await nodeFs.writeFile(path.join(ctx.workDir, 'read.txt'), content);
    const hash = sha256(content);
    const refKey = `${ctx.mountPrefix}/read.txt`;

    const snap = makeSnapshot();
    const assistantMsg: AgentMessage = {
      ...makeAssistantMsg('a1', 'reading file', snap),
      metadata: {
        ...makeMetadata(snap),
        pathReferences: { [refKey]: hash },
      },
    } as AgentMessage;

    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'read that file', snap),
      assistantMsg,
      makeUserMsg('u2', 'what did you find?', snap),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      ctx.agentId,
      ctx.blobReader,
      undefined,
      undefined,
      undefined,
      noopLogger,
      undefined,
      undefined,
      ctx.cache,
      ctx.mountPaths,
    );

    // Find the assistant message index
    let assistantIdx = -1;
    for (let i = 0; i < result.length; i++) {
      if (result[i].role === 'assistant') {
        assistantIdx = i;
        break;
      }
    }
    expect(assistantIdx).toBeGreaterThan(-1);

    // After the assistant, there should be a synthetic user message
    // containing the file content
    const afterAssistant = result[assistantIdx + 1];
    expect(afterAssistant.role).toBe('user');
    const texts = getUserMsgTexts(afterAssistant);
    const allText = texts.join('');
    expect(allText).toContain('<file path=');
    expect(allText).toContain('read.txt');
    expect(allText).toContain(content);
  });

  it('gracefully no-ops when fileReadCache or mountPaths not provided', async () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      {
        ...makeUserMsg('u1', 'hello', snap),
        metadata: {
          ...makeMetadata(snap),
          pathReferences: { 'w1/file.ts': 'somehash' },
        },
      } as AgentMessage,
    ];

    // Call without fileReadCache and mountPaths
    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      'agent-1',
      noopBlobReader,
    );

    // Should still produce a user message with just user-msg
    const userMsg = result.find((m) => m.role === 'user')!;
    const texts = getUserMsgTexts(userMsg);
    // No <file> injection since the pipeline is disabled
    expect(texts.join('').includes('<file path=')).toBe(false);
    expect(texts.some((t) => t.includes('hello'))).toBe(true);
  });

  it('emits error placeholder when file cannot be read', async () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      {
        ...makeUserMsg('u1', 'check missing file', snap),
        metadata: {
          ...makeMetadata(snap),
          pathReferences: {
            [`${ctx.mountPrefix}/nonexistent.ts`]: 'fakehash',
          },
        },
      } as AgentMessage,
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      ctx.agentId,
      ctx.blobReader,
      undefined,
      undefined,
      undefined,
      noopLogger,
      undefined,
      undefined,
      ctx.cache,
      ctx.mountPaths,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const texts = getUserMsgTexts(userMsg);
    const allText = texts.join('');
    // Should contain an error placeholder
    expect(allText).toContain('error');
    expect(allText).toContain('nonexistent.ts');
  });

  it('handles multiple files in a single user message', async () => {
    const content1 = 'file one content';
    const content2 = 'file two content';
    await nodeFs.writeFile(path.join(ctx.workDir, 'one.ts'), content1);
    await nodeFs.writeFile(path.join(ctx.workDir, 'two.ts'), content2);

    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      {
        ...makeUserMsg('u1', 'review these files', snap),
        metadata: {
          ...makeMetadata(snap),
          pathReferences: {
            [`${ctx.mountPrefix}/one.ts`]: sha256(content1),
            [`${ctx.mountPrefix}/two.ts`]: sha256(content2),
          },
        },
      } as AgentMessage,
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      ctx.agentId,
      ctx.blobReader,
      undefined,
      undefined,
      undefined,
      noopLogger,
      undefined,
      undefined,
      ctx.cache,
      ctx.mountPaths,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const texts = getUserMsgTexts(userMsg);
    const allText = texts.join('');
    expect(allText).toContain('one.ts');
    expect(allText).toContain(content1);
    expect(allText).toContain('two.ts');
    expect(allText).toContain(content2);
  });

  it('does not inject when pathReferences is empty', async () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      {
        ...makeUserMsg('u1', 'no refs', snap),
        metadata: {
          ...makeMetadata(snap),
          pathReferences: {},
        },
      } as AgentMessage,
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      ctx.agentId,
      ctx.blobReader,
      undefined,
      undefined,
      undefined,
      noopLogger,
      undefined,
      undefined,
      ctx.cache,
      ctx.mountPaths,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const texts = getUserMsgTexts(userMsg);
    expect(texts.join('').includes('<file path=')).toBe(false);
  });
});

describe('resolveEffectiveSnapshot', () => {
  it('returns full snapshot from a single message', () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [makeUserMsg('u1', 'hello', snap)];
    const resolved = resolveEffectiveSnapshot(messages, 0);
    expect(resolved).toEqual(snap);
  });

  it('returns null when no messages have snapshots', () => {
    const messages: AgentMessage[] = [makeUserMsg('u1', 'hello')];
    const resolved = resolveEffectiveSnapshot(messages, 0);
    expect(resolved).toBeNull();
  });

  it('assembles full snapshot from sparse messages by walking backward', () => {
    const fullSnap = makeSnapshot();
    const sparseSnap: EnvironmentSnapshot = {
      browser: { tabs: [], activeTabId: null },
    };
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', fullSnap),
      makeAssistantMsg('a1', 'response', sparseSnap),
    ];
    const resolved = resolveEffectiveSnapshot(messages, 1);
    expect(resolved).not.toBeNull();
    expect(resolved!.browser).toEqual({ tabs: [], activeTabId: null });
    expect(resolved!.workspace).toEqual(fullSnap.workspace);
    expect(resolved!.fileDiffs).toEqual(fullSnap.fileDiffs);
    expect(resolved!.sandboxSessionId).toBe(fullSnap.sandboxSessionId);
  });

  it('returns null when partial coverage across all messages', () => {
    const sparseSnap: EnvironmentSnapshot = {
      browser: { tabs: [], activeTabId: null },
    };
    const messages: AgentMessage[] = [makeUserMsg('u1', 'hello', sparseSnap)];
    const resolved = resolveEffectiveSnapshot(messages, 0);
    expect(resolved).toBeNull();
  });

  it('respects upToIndex and ignores later messages', () => {
    const snap1 = makeSnapshot();
    const snap2 = makeSnapshot({
      browser: { tabs: [], activeTabId: null },
    });
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap1),
      makeAssistantMsg('a1', 'response', snap2),
    ];
    const resolved = resolveEffectiveSnapshot(messages, 0);
    expect(resolved!.browser).toEqual(snap1.browser);
  });

  it('handles out-of-bounds upToIndex gracefully', () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [makeUserMsg('u1', 'hello', snap)];
    const resolved = resolveEffectiveSnapshot(messages, -1);
    expect(resolved).toBeNull();
  });

  it('picks most recent domain values across multiple sparse messages', () => {
    const baseSnap = makeSnapshot();
    const sparse1: EnvironmentSnapshot = {
      browser: {
        tabs: [{ id: '2', url: 'https://b.com', title: 'B' }],
        activeTabId: '2',
      },
    };
    const sparse2: EnvironmentSnapshot = {
      workspace: { mounts: [] },
    };
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'first', baseSnap),
      makeAssistantMsg('a1', 'reply', sparse1),
      makeUserMsg('u2', 'second', sparse2),
    ];
    const resolved = resolveEffectiveSnapshot(messages, 2);
    expect(resolved!.workspace).toEqual({ mounts: [] });
    expect(resolved!.browser).toEqual(sparse1.browser);
    expect(resolved!.fileDiffs).toEqual(baseSnap.fileDiffs);
    expect(resolved!.sandboxSessionId).toBe(baseSnap.sandboxSessionId);
  });
});

describe('sparsifySnapshot', () => {
  it('returns full snapshot when previous is null (keyframe)', () => {
    const full = makeSnapshot();
    const sparse = sparsifySnapshot(full, null);
    expect(sparse).toEqual(full);
  });

  it('returns empty object when nothing changed', () => {
    const snap = makeSnapshot();
    const sparse = sparsifySnapshot(snap, snap);
    expect(sparse).toEqual({});
  });

  it('includes only changed browser domain', () => {
    const previous = makeSnapshot();
    const current = makeSnapshot({
      browser: { tabs: [], activeTabId: null },
    });
    const sparse = sparsifySnapshot(current, previous);
    expect(sparse.browser).toEqual({ tabs: [], activeTabId: null });
    expect(sparse.workspace).toBeUndefined();
    expect(sparse.fileDiffs).toBeUndefined();
    expect(sparse.sandboxSessionId).toBeUndefined();
  });

  it('includes only changed workspace domain', () => {
    const previous = makeSnapshot();
    const current = makeSnapshot({ workspace: { mounts: [] } });
    const sparse = sparsifySnapshot(current, previous);
    expect(sparse.workspace).toEqual({ mounts: [] });
    expect(sparse.browser).toBeUndefined();
  });

  it('includes only changed sandboxSessionId', () => {
    const previous = makeSnapshot();
    const current = makeSnapshot({ sandboxSessionId: 'new-session' });
    const sparse = sparsifySnapshot(current, previous);
    expect(sparse.sandboxSessionId).toBe('new-session');
    expect(sparse.browser).toBeUndefined();
    expect(sparse.workspace).toBeUndefined();
    expect(sparse.fileDiffs).toBeUndefined();
  });

  it('includes multiple changed domains', () => {
    const previous = makeSnapshot();
    const current = makeSnapshot({
      browser: { tabs: [], activeTabId: null },
      sandboxSessionId: 'changed',
    });
    const sparse = sparsifySnapshot(current, previous);
    expect(sparse.browser).toBeDefined();
    expect(sparse.sandboxSessionId).toBe('changed');
    expect(sparse.workspace).toBeUndefined();
    expect(sparse.fileDiffs).toBeUndefined();
  });
});

describe('sparse snapshot diffing in convertAgentMessagesToModelMessages', () => {
  const agentId = 'agent-1';

  it('detects changes from sparse snapshots via backward resolution', async () => {
    const baseSnap = makeSnapshot();
    const sparseSnap: EnvironmentSnapshot = {
      browser: { tabs: [], activeTabId: null },
    };
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', baseSnap),
      makeAssistantMsg('a1', 'response'),
      makeUserMsg('u2', 'follow up', sparseSnap),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'system prompt',
      {},
      agentId,
      noopBlobReader,
    );

    const secondUser = result.filter((m) => m.role === 'user')[1];
    expect(hasEnvChanges(secondUser)).toBe(true);
    const texts = getUserMsgTexts(secondUser);
    expect(texts.some((t) => t.includes('<tab-closed'))).toBe(true);
  });

  it('does not inject env-changes when sparse snapshots carry no effective change', async () => {
    const baseSnap = makeSnapshot();
    const emptySparse: EnvironmentSnapshot = {};
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', baseSnap),
      makeAssistantMsg('a1', 'response', emptySparse),
      makeUserMsg('u2', 'next', emptySparse),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'system prompt',
      {},
      agentId,
      noopBlobReader,
    );

    const secondUser = result.filter((m) => m.role === 'user')[1];
    expect(hasEnvChanges(secondUser)).toBe(false);
  });

  it('resolves across undo boundary: keyframe after truncation', async () => {
    const snap1 = makeSnapshot();
    const snap2 = makeSnapshot({
      browser: {
        tabs: [{ id: '2', url: 'https://b.com', title: 'B' }],
        activeTabId: '2',
      },
    });
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'first', snap1),
      makeUserMsg('u2', 'after undo - keyframe', snap2),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'system prompt',
      {},
      agentId,
      noopBlobReader,
    );

    const secondUser = result.filter((m) => m.role === 'user')[1];
    expect(hasEnvChanges(secondUser)).toBe(true);
    const texts = getUserMsgTexts(secondUser);
    expect(texts.some((t) => t.includes('<tab-opened'))).toBe(true);
  });
});

describe('convertAgentMessagesToModelMessages – overall message structure', () => {
  const agentId = 'agent-1';

  it('produces [system, user, assistant] for a simple exchange', async () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap),
      makeAssistantMsg('a1', 'hi', snap),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'system prompt',
      {},
      agentId,
      noopBlobReader,
    );

    expect(result.map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
  });

  it('fresh chat with snapshot: first user message has env-snapshot + user-msg', async () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [makeUserMsg('u1', 'hi there', snap)];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const texts = getUserMsgTexts(userMsg);
    expect(texts.some((t) => t.includes('<env-snapshot>'))).toBe(true);
    expect(texts.some((t) => t.includes('<user-msg'))).toBe(true);
    expect(texts.some((t) => t.includes('hi there'))).toBe(true);
  });

  it('fresh chat without snapshot: user message has only user-msg', async () => {
    const messages: AgentMessage[] = [makeUserMsg('u1', 'hi there')];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const texts = getUserMsgTexts(userMsg);
    expect(texts.some((t) => t.includes('<env-snapshot>'))).toBe(false);
    expect(texts.some((t) => t.includes('<env-changes>'))).toBe(false);
    expect(texts.some((t) => t.includes('<user-msg'))).toBe(true);
  });

  it('env-snapshot includes browser tabs from the snapshot', async () => {
    const snap = makeSnapshot({
      browser: {
        tabs: [{ id: '1', url: 'https://example.com', title: 'Example' }],
        activeTabId: '1',
      },
    });
    const messages: AgentMessage[] = [makeUserMsg('u1', 'hello', snap)];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const texts = getUserMsgTexts(userMsg);
    const snapshotText = texts.find((t) => t.includes('<env-snapshot>'))!;
    expect(snapshotText).toContain('Example');
    expect(snapshotText).toContain('https://example.com');
    expect(snapshotText).toContain('active="true"');
  });
});

describe('convertAgentMessagesToModelMessages – compression boundary', () => {
  const agentId = 'agent-1';

  function makeUserMsgWithCompression(
    id: string,
    text: string,
    compressedHistory: string,
    snapshot?: EnvironmentSnapshot,
  ): AgentMessage & { role: 'user' } {
    return {
      id,
      role: 'user',
      parts: [{ type: 'text', text }],
      metadata: {
        ...makeMetadata(snapshot),
        compressedHistory,
      },
    } as AgentMessage & { role: 'user' };
  }

  it('emits compressed-history and stops including earlier messages', async () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      makeUserMsg('u0', 'old message', snap),
      makeAssistantMsg('a0', 'old reply', snap),
      makeUserMsgWithCompression(
        'u1',
        'boundary message',
        'Previous conversation summary...',
        snap,
      ),
      makeAssistantMsg('a1', 'reply after compression', snap),
      makeUserMsg('u2', 'latest', snap),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    const allTexts = result.flatMap((m) => {
      if (m.role === 'user' || m.role === 'system') {
        return getUserMsgTexts(m);
      }
      return [];
    });
    // Old messages before boundary are excluded
    expect(allTexts.some((t) => t.includes('old message'))).toBe(false);
    // Compressed history is present as a standalone user message
    expect(
      allTexts.some((t) => t.includes('Previous conversation summary')),
    ).toBe(true);
    expect(allTexts.some((t) => t.includes('latest'))).toBe(true);
  });

  it('compressed-history is merged into the boundary user message', async () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      makeUserMsg('u0', 'old', snap),
      makeAssistantMsg('a0', 'old reply', snap),
      makeUserMsgWithCompression('u1', 'boundary', 'summary here', snap),
      makeAssistantMsg('a1', 'reply', snap),
      makeUserMsg('u2', 'latest', snap),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    // The boundary user message should contain compressed-history,
    // env-snapshot, and user-msg all in one message
    const boundaryUser = result.find((m) => {
      if (m.role !== 'user') return false;
      const texts = getUserMsgTexts(m);
      return texts.some((t) => t.includes('boundary'));
    })!;
    const texts = getUserMsgTexts(boundaryUser);
    expect(texts.some((t) => t.includes('<memory'))).toBe(true);
    expect(hasEnvSnapshot(boundaryUser)).toBe(true);
    expect(texts.some((t) => t.includes('<user-msg'))).toBe(true);

    // Ordering: compressed-history before env-snapshot before user-msg
    const compIdx = texts.findIndex((t) => t.includes('<memory'));
    const envIdx = texts.findIndex((t) => t.includes('<env-snapshot>'));
    const userIdx = texts.findIndex((t) => t.includes('<user-msg'));
    expect(compIdx).toBeLessThan(envIdx);
    expect(envIdx).toBeLessThan(userIdx);

    // No synthetic assistant ack anywhere
    const ackMsg = result.find(
      (m) =>
        m.role === 'assistant' &&
        (typeof m.content === 'string' ? m.content : '').includes(
          'prior conversation',
        ),
    );
    expect(ackMsg).toBeUndefined();
  });

  it('first user message after compression gets env-snapshot', async () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      makeUserMsg('u0', 'old', snap),
      makeAssistantMsg('a0', 'old reply', snap),
      makeUserMsgWithCompression('u1', 'boundary', 'summary', snap),
      makeAssistantMsg('a1', 'reply', snap),
      makeUserMsg('u2', 'latest', snap),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    // The boundary user message (first real user after compression)
    // should have env-snapshot
    const userMessages = result.filter((m) => m.role === 'user');
    const firstRealUser = userMessages.find((m) => {
      const texts = getUserMsgTexts(m);
      return texts.some((t) => t.includes('<user-msg'));
    })!;
    expect(hasEnvSnapshot(firstRealUser)).toBe(true);
  });

  it('compressed-history on assistant message creates standalone user before it', async () => {
    const snap = makeSnapshot();
    // Simulate compression landing on an assistant message
    const assistantWithCompression: AgentMessage = {
      id: 'a-boundary',
      role: 'assistant',
      parts: [{ type: 'text', text: 'boundary reply', state: 'done' }],
      metadata: {
        ...makeMetadata(snap),
        compressedHistory: 'compressed summary',
      },
    } as AgentMessage;

    const messages: AgentMessage[] = [
      makeUserMsg('u0', 'old', snap),
      assistantWithCompression,
      makeUserMsg('u1', 'after boundary', snap),
      makeAssistantMsg('a1', 'reply', snap),
      makeUserMsg('u2', 'latest', snap),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    // Should have: user (compressed history) → assistant (boundary reply)
    // Find the assistant that has 'boundary reply'
    let assistantIdx = -1;
    for (let i = 0; i < result.length; i++) {
      if (result[i].role === 'assistant') {
        const texts = getUserMsgTexts(result[i]);
        if (texts.some((t: string) => t.includes('boundary reply'))) {
          assistantIdx = i;
          break;
        }
      }
    }
    expect(assistantIdx).toBeGreaterThan(0);

    // The message right before the boundary assistant is the compressed
    // history user message — no synthetic ack in between.
    const compMsg = result[assistantIdx - 1];
    expect(compMsg.role).toBe('user');
    const texts = getUserMsgTexts(compMsg);
    expect(texts.some((t: string) => t.includes('<memory'))).toBe(true);

    // No synthetic assistant ack anywhere
    const ackMsg = result.find(
      (m) =>
        m.role === 'assistant' &&
        (typeof m.content === 'string' ? m.content : '').includes(
          'prior conversation',
        ),
    );
    expect(ackMsg).toBeUndefined();
  });
});

describe('convertAgentMessagesToModelMessages – env-changes after assistant', () => {
  const agentId = 'agent-1';

  it('env-changes on assistant message appear as synthetic user AFTER the assistant', async () => {
    const snap1 = makeSnapshot();
    const snap2: EnvironmentSnapshot = {
      browser: {
        tabs: [
          { id: '1', url: 'https://a.com', title: 'A' },
          { id: '2', url: 'https://b.com', title: 'B' },
        ],
        activeTabId: '2',
      },
    };
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap1),
      makeAssistantMsg('a1', 'did some work', snap2),
      makeUserMsg('u2', 'what happened?', undefined),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    // Find the assistant message index
    let assistantIdx = -1;
    for (let i = 0; i < result.length; i++) {
      if (result[i].role === 'assistant') {
        assistantIdx = i;
        break;
      }
    }
    expect(assistantIdx).toBeGreaterThan(-1);

    // The message right after the assistant should be a synthetic user
    // message containing env-changes (tab opened)
    const afterAssistant = result[assistantIdx + 1];
    expect(afterAssistant.role).toBe('user');
    const afterTexts = getUserMsgTexts(afterAssistant);
    expect(afterTexts.some((t) => t.includes('<env-changes>'))).toBe(true);
    expect(afterTexts.some((t) => t.includes('<tab-opened'))).toBe(true);

    // The last user message should NOT also contain those env-changes
    const lastUserMsg = result[result.length - 1];
    expect(lastUserMsg.role).toBe('user');
    const lastTexts = getUserMsgTexts(lastUserMsg);
    expect(lastTexts.some((t) => t.includes('tab opened'))).toBe(false);
  });

  it('no synthetic user message when assistant snapshot has no effective changes', async () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap),
      makeAssistantMsg('a1', 'reply', snap),
      makeUserMsg('u2', 'next', snap),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    // Should be: system, user, assistant, user — no synthetic message
    const roles = result.map((m) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'user']);
  });
});

describe('convertAgentMessagesToModelMessages – fresh chat env-snapshot', () => {
  const agentId = 'agent-1';

  it('fresh chat with single user message gets env-snapshot', async () => {
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [makeUserMsg('u1', 'first msg', snap)];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    // Should have system + user
    expect(result.length).toBe(2);
    expect(result[0].role).toBe('system');
    expect(result[1].role).toBe('user');

    // User message should contain env-snapshot and user-msg
    const texts = getUserMsgTexts(result[1]);
    expect(texts.some((t) => t.includes('<env-snapshot>'))).toBe(true);
    expect(texts.some((t) => t.includes('<user-msg'))).toBe(true);
    expect(texts.some((t) => t.includes('first msg'))).toBe(true);

    // env-snapshot should come before user-msg
    const envIdx = texts.findIndex((t) => t.includes('<env-snapshot>'));
    const userMsgIdx = texts.findIndex((t) => t.includes('<user-msg'));
    expect(envIdx).toBeLessThan(userMsgIdx);
  });

  it('fresh chat env-snapshot includes all domain data', async () => {
    const snap = makeSnapshot({
      browser: {
        tabs: [{ id: '1', url: 'https://example.com', title: 'My Page' }],
        activeTabId: '1',
      },
      workspace: {
        mounts: [{ prefix: 'w1', path: '/my-project' }],
      },
      sandboxSessionId: 'sandbox-123',
      agentsMd: {
        entries: [{ mountPrefix: 'w1', content: '# Rules' }],
        respectedMounts: ['w1'],
      },
      enabledSkills: { paths: ['w1/.stagewise/skills/my-skill'] },
    });
    const messages: AgentMessage[] = [makeUserMsg('u1', 'start', snap)];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const texts = getUserMsgTexts(userMsg);
    const snapshotText = texts.find((t) => t.includes('<env-snapshot>'))!;
    expect(snapshotText).toContain('My Page');
    expect(snapshotText).toContain('/my-project');
    expect(snapshotText).toContain('sandbox-123');
    expect(snapshotText).toContain('AGENTS.md');
    expect(snapshotText).toContain('# Rules');
  });

  it('fresh chat without any snapshot does not emit env-snapshot', async () => {
    const messages: AgentMessage[] = [makeUserMsg('u1', 'hello')];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const texts = getUserMsgTexts(userMsg);
    expect(texts.some((t) => t.includes('<env-snapshot>'))).toBe(false);
    expect(texts.some((t) => t.includes('<user-msg'))).toBe(true);
  });
});

describe('convertAgentMessagesToModelMessages – multi-mount workspaces', () => {
  const agentId = 'agent-1';

  function multiMountSnapshot(
    overrides: Partial<FullEnvironmentSnapshot> = {},
  ): FullEnvironmentSnapshot {
    return makeSnapshot({
      workspace: {
        mounts: [
          { prefix: 'w1', path: '/home/user/frontend' },
          { prefix: 'w2', path: '/home/user/backend' },
        ],
      },
      agentsMd: {
        entries: [
          { mountPrefix: 'w1', content: '# Frontend rules' },
          { mountPrefix: 'w2', content: '# Backend rules' },
        ],
        respectedMounts: ['w1', 'w2'],
      },
      workspaceMd: {
        entries: [
          { mountPrefix: 'w1', content: '# Frontend workspace' },
          { mountPrefix: 'w2', content: '# Backend workspace' },
        ],
      },
      enabledSkills: {
        paths: [
          'w1/.stagewise/skills/react-skill',
          'w2/.stagewise/skills/api-skill',
        ],
      },
      ...overrides,
    });
  }

  it('env-snapshot includes data from all mounts', async () => {
    const snap = multiMountSnapshot();
    const messages: AgentMessage[] = [makeUserMsg('u1', 'start', snap)];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const texts = getUserMsgTexts(userMsg);
    const snapshotText = texts.find((t) => t.includes('<env-snapshot>'))!;
    expect(snapshotText).toBeDefined();

    // Both workspaces mounted
    expect(snapshotText).toContain('/home/user/frontend');
    expect(snapshotText).toContain('/home/user/backend');
    // Both AGENTS.md files
    expect(snapshotText).toContain('# Frontend rules');
    expect(snapshotText).toContain('# Backend rules');
    // Both WORKSPACE.md files
    expect(snapshotText).toContain('# Frontend workspace');
    expect(snapshotText).toContain('# Backend workspace');
    // Both skills
    expect(snapshotText).toContain('react-skill');
    expect(snapshotText).toContain('api-skill');
  });

  it('env-changes reflect AGENTS.md update in one mount while other stays', async () => {
    const snap1 = multiMountSnapshot();
    const snap2: EnvironmentSnapshot = {
      agentsMd: {
        entries: [
          { mountPrefix: 'w1', content: '# Frontend rules v2' },
          { mountPrefix: 'w2', content: '# Backend rules' },
        ],
        respectedMounts: ['w1', 'w2'],
      },
    };
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap1),
      makeAssistantMsg('a1', 'reply', undefined),
      makeUserMsg('u2', 'next', snap2),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    const secondUser = result.filter((m) => m.role === 'user')[1];
    const texts = getUserMsgTexts(secondUser);
    expect(texts.some((t) => t.includes('<env-changes>'))).toBe(true);
    // Should detect w1 AGENTS.md updated (diff between v1 and v2)
    const changesText = texts.find((t) => t.includes('<env-changes>'))!;
    expect(changesText).toContain('agents-md-updated');
    expect(changesText).toContain('w1');
    // Should NOT contain a change for w2 since it didn't change
    expect(changesText).not.toContain('w2');
  });

  it('env-changes reflect WORKSPACE.md added in new mount', async () => {
    const snap1 = multiMountSnapshot();
    const snap2: EnvironmentSnapshot = {
      workspace: {
        mounts: [
          { prefix: 'w1', path: '/home/user/frontend' },
          { prefix: 'w2', path: '/home/user/backend' },
          { prefix: 'w3', path: '/home/user/shared' },
        ],
      },
      workspaceMd: {
        entries: [
          { mountPrefix: 'w1', content: '# Frontend workspace' },
          { mountPrefix: 'w2', content: '# Backend workspace' },
          { mountPrefix: 'w3', content: '# Shared lib docs' },
        ],
      },
    };
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap1),
      makeAssistantMsg('a1', 'hi', undefined),
      makeUserMsg('u2', 'update', snap2),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    const secondUser = result.filter((m) => m.role === 'user')[1];
    const texts = getUserMsgTexts(secondUser);
    const changesText = texts.find((t) => t.includes('<env-changes>'))!;
    expect(changesText).toBeDefined();
    // New workspace mounted
    expect(changesText).toContain('w3');
    expect(changesText).toContain('workspace-md-created');
    expect(changesText).toContain('<workspace-mounted');
  });

  it('env-changes reflect one mount unmounted and its AGENTS.md removed', async () => {
    const snap1 = multiMountSnapshot();
    const snap2: EnvironmentSnapshot = {
      workspace: {
        mounts: [{ prefix: 'w1', path: '/home/user/frontend' }],
      },
      agentsMd: {
        entries: [{ mountPrefix: 'w1', content: '# Frontend rules' }],
        respectedMounts: ['w1'],
      },
      workspaceMd: {
        entries: [{ mountPrefix: 'w1', content: '# Frontend workspace' }],
      },
    };
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap1),
      makeAssistantMsg('a1', 'reply', undefined),
      makeUserMsg('u2', 'removed backend', snap2),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    const secondUser = result.filter((m) => m.role === 'user')[1];
    const texts = getUserMsgTexts(secondUser);
    const changesText = texts.find((t) => t.includes('<env-changes>'))!;
    expect(changesText).toBeDefined();
    // w2 unmounted
    expect(changesText).toContain('<workspace-unmounted');
    expect(changesText).toContain('w2');
    // w2 AGENTS.md and WORKSPACE.md removed
    expect(changesText).toContain('agents-md-deleted');
    expect(changesText).toContain('workspace-md-deleted');
  });

  it('env-changes reflect skill enabled in one mount and disabled in another', async () => {
    const snap1 = multiMountSnapshot();
    const snap2: EnvironmentSnapshot = {
      enabledSkills: {
        paths: [
          'w2/.stagewise/skills/api-skill',
          'w2/.stagewise/skills/new-skill',
        ],
      },
    };
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap1),
      makeAssistantMsg('a1', 'reply', undefined),
      makeUserMsg('u2', 'skills changed', snap2),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    const secondUser = result.filter((m) => m.role === 'user')[1];
    const texts = getUserMsgTexts(secondUser);
    const changesText = texts.find((t) => t.includes('<env-changes>'))!;
    expect(changesText).toBeDefined();
    // react-skill from w1 disabled, new-skill from w2 enabled
    expect(changesText).toContain('skill-disabled');
    expect(changesText).toContain('react-skill');
    expect(changesText).toContain('skill-enabled');
    expect(changesText).toContain('new-skill');
  });

  it('env-changes on assistant message reflect cross-mount changes as synthetic user after', async () => {
    const snap1 = multiMountSnapshot();
    const snap2: EnvironmentSnapshot = {
      agentsMd: {
        entries: [
          { mountPrefix: 'w1', content: '# Frontend rules updated' },
          { mountPrefix: 'w2', content: '# Backend rules updated' },
        ],
        respectedMounts: ['w1', 'w2'],
      },
    };
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'hello', snap1),
      makeAssistantMsg('a1', 'did work', snap2),
      makeUserMsg('u2', 'what changed?', undefined),
    ];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      agentId,
      noopBlobReader,
    );

    // Find the assistant message
    let assistantIdx = -1;
    for (let i = 0; i < result.length; i++) {
      if (result[i].role === 'assistant') {
        assistantIdx = i;
        break;
      }
    }
    expect(assistantIdx).toBeGreaterThan(-1);

    // Synthetic user message right after assistant
    const syntheticUser = result[assistantIdx + 1];
    expect(syntheticUser.role).toBe('user');
    const texts = getUserMsgTexts(syntheticUser);
    const changesText = texts.find((t) => t.includes('<env-changes>'))!;
    expect(changesText).toBeDefined();
    // Both w1 and w2 AGENTS.md updated
    expect(changesText).toContain('agents-md-updated');
    expect(changesText).toContain('w1');
    expect(changesText).toContain('w2');
  });
});
