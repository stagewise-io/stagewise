import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import type {
  EnvironmentSnapshot,
  FullEnvironmentSnapshot,
} from '@shared/karton-contracts/ui/agent/metadata';
import type { UserMessageMetadata } from '@shared/karton-contracts/ui/agent/metadata';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import { convertAgentMessagesToModelMessages } from './utils';
import type { ModelCapabilities } from '@shared/karton-contracts/ui/shared-types';
import {
  resolveEffectiveSnapshot,
  sparsifySnapshot,
} from '../prompts/utils/environment-changes';

function makeSnapshot(
  overrides: Partial<FullEnvironmentSnapshot> = {},
): FullEnvironmentSnapshot {
  return {
    browser: {
      tabs: [{ id: 't_1', url: 'https://a.com', title: 'A' }],
      activeTabId: 't_1',
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

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

async function makeWebp(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .webp({ quality: 70 })
    .toBuffer();
}

/** Minimal PDF magic bytes — enough for isImageMime to return false. */
function makeFakePdf(): Buffer {
  return Buffer.from('%PDF-1.4 fake content');
}

// ---------------------------------------------------------------------------
// ModelCapabilities fixtures
// ---------------------------------------------------------------------------

function makeVisionCapabilities(
  overrides: Partial<ModelCapabilities['inputConstraints']> = {},
): ModelCapabilities {
  return {
    inputModalities: {
      text: true,
      image: true,
      file: false,
      audio: false,
      video: false,
    },
    outputModalities: {
      text: true,
      image: false,
      file: false,
      audio: false,
      video: false,
    },
    toolCalling: true,
    inputConstraints: {
      image: {
        mimeTypes: ['image/webp', 'image/png', 'image/jpeg'],
        maxBytes: 5_242_880,
        maxWidthPx: 2048,
        maxHeightPx: 2048,
        maxTotalPixels: 1_572_864,
      },
      ...overrides,
    },
  };
}

function makeTextOnlyCapabilities(): ModelCapabilities {
  return {
    inputModalities: {
      text: true,
      image: false,
      file: false,
      audio: false,
      video: false,
    },
    outputModalities: {
      text: true,
      image: false,
      file: false,
      audio: false,
      video: false,
    },
    toolCalling: true,
  };
}

function makeFileCapabilities(): ModelCapabilities {
  return {
    inputModalities: {
      text: true,
      image: false,
      file: true,
      audio: false,
      video: false,
    },
    outputModalities: {
      text: true,
      image: false,
      file: false,
      audio: false,
      video: false,
    },
    toolCalling: true,
    inputConstraints: {
      file: {
        mimeTypes: ['application/pdf'],
        maxBytes: 20_971_520,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers to extract parts from model messages
// ---------------------------------------------------------------------------

function getImageParts(msg: any): any[] {
  const content = Array.isArray(msg.content) ? msg.content : [];
  return content.filter((p: any) => p.type === 'image');
}

function getFileParts(msg: any): any[] {
  const content = Array.isArray(msg.content) ? msg.content : [];
  return content.filter((p: any) => p.type === 'file');
}

function makeUserMsgWithAttachment(
  id: string,
  text: string,
  attachment: {
    id: string;
    mediaType: string;
    sizeBytes: number;
    fileName: string;
  },
): AgentMessage & { role: 'user' } {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
    metadata: {
      createdAt: new Date(),
      partsMetadata: [],
      environmentSnapshot: undefined,
      fileAttachments: [attachment],
    },
  } as any;
}

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
      0,
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
      0,
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
      0,
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
      0,
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
            id: 't_5',
            url: 'https://new.com',
            title: 'New',
          },
        ],
        activeTabId: 't_5',
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
      0,
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
      0,
      agentId,
      noopBlobReader,
    );

    const userMessages = result.filter((m) => m.role === 'user');
    expect(hasEnvSnapshot(userMessages[0])).toBe(false);
    expect(hasEnvChanges(userMessages[0])).toBe(false);
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
        tabs: [{ id: 't_2', url: 'https://b.com', title: 'B' }],
        activeTabId: 't_2',
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
      0,
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
      0,
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
        tabs: [{ id: 't_2', url: 'https://b.com', title: 'B' }],
        activeTabId: 't_2',
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
      0,
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
      0,
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
      0,
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
      0,
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
        tabs: [{ id: 't_1', url: 'https://example.com', title: 'Example' }],
        activeTabId: 't_1',
      },
    });
    const messages: AgentMessage[] = [makeUserMsg('u1', 'hello', snap)];

    const result = await convertAgentMessagesToModelMessages(
      messages,
      'sys',
      {},
      0,
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
      2,
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
    // Compressed history is present (merged into the boundary user msg)
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
      2,
      agentId,
      noopBlobReader,
    );

    // The boundary user message should contain compressed-history,
    // env-snapshot, and user-msg all in one message
    const userMessages = result.filter((m) => m.role === 'user');
    const boundaryUser = userMessages.find((m) => {
      const texts = getUserMsgTexts(m);
      return texts.some((t) => t.includes('boundary'));
    })!;
    const texts = getUserMsgTexts(boundaryUser);
    expect(
      texts.some((t) => t.includes('<compressed-conversation-history')),
    ).toBe(true);
    expect(hasEnvSnapshot(boundaryUser)).toBe(true);
    expect(texts.some((t) => t.includes('<user-msg'))).toBe(true);

    // Ordering: compressed-history before env-snapshot before user-msg
    const compIdx = texts.findIndex((t) =>
      t.includes('<compressed-conversation-history'),
    );
    const envIdx = texts.findIndex((t) => t.includes('<env-snapshot>'));
    const userIdx = texts.findIndex((t) => t.includes('<user-msg'));
    expect(compIdx).toBeLessThan(envIdx);
    expect(envIdx).toBeLessThan(userIdx);
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
      2,
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

  it('compressed-history on assistant message creates synthetic user before it', async () => {
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
      3,
      agentId,
      noopBlobReader,
    );

    // Should have a synthetic user message before the assistant
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
    // The message before it should be a user message with compressed history
    const beforeAssistant = result[assistantIdx - 1];
    expect(beforeAssistant.role).toBe('user');
    const texts = getUserMsgTexts(beforeAssistant);
    expect(
      texts.some((t: string) => t.includes('<compressed-conversation-history')),
    ).toBe(true);
  });
});

describe('convertAgentMessagesToModelMessages – env-changes after assistant', () => {
  const agentId = 'agent-1';

  it('env-changes on assistant message appear as synthetic user AFTER the assistant', async () => {
    const snap1 = makeSnapshot();
    const snap2: EnvironmentSnapshot = {
      browser: {
        tabs: [
          { id: 't_1', url: 'https://a.com', title: 'A' },
          { id: 't_2', url: 'https://b.com', title: 'B' },
        ],
        activeTabId: 't_2',
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
      0,
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
      0,
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
      0,
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
        tabs: [{ id: 't_1', url: 'https://example.com', title: 'My Page' }],
        activeTabId: 't_1',
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
      0,
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
      0,
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
      0,
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
      0,
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
      0,
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
      0,
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
      0,
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
      0,
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

// =============================================================================
// Image attachment pipeline — convertUserMessage path
// =============================================================================

describe('image attachment pipeline — user-attached images (convertUserMessage)', () => {
  const agentId = 'agent-1';

  it('PNG image is processed to WebP and emitted as ImagePart', async () => {
    const rawBuf = await makePng(200, 200);
    const msg = makeUserMsgWithAttachment('u1', 'look at this', {
      id: 'att-1',
      mediaType: 'image/png',
      sizeBytes: rawBuf.length,
      fileName: 'photo.png',
    });

    const blobReader = async () => rawBuf;
    const caps = makeVisionCapabilities();

    const result = await convertAgentMessagesToModelMessages(
      [msg],
      '',
      {},
      0,
      agentId,
      blobReader,
      caps,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const imgs = getImageParts(userMsg);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].mediaType).toBe('image/webp');
    expect(imgs[0].image).toBeInstanceOf(Uint8Array);
    expect(imgs[0].image.length).toBeGreaterThan(0);
  });

  it('WebP image that is already optimal is returned unchanged', async () => {
    const rawBuf = await makeWebp(100, 100);
    const msg = makeUserMsgWithAttachment('u1', 'hi', {
      id: 'att-1',
      mediaType: 'image/webp',
      sizeBytes: rawBuf.length,
      fileName: 'img.webp',
    });

    const blobReader = async () => rawBuf;
    const caps = makeVisionCapabilities();

    const result = await convertAgentMessagesToModelMessages(
      [msg],
      '',
      {},
      0,
      agentId,
      blobReader,
      caps,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const imgs = getImageParts(userMsg);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].mediaType).toBe('image/webp');
  });

  it('image uses cache on second call (cache.get returns hit)', async () => {
    const rawBuf = await makePng(200, 200);
    const processedBuf = await makeWebp(200, 200);

    const mockCache = {
      get: vi
        .fn()
        .mockResolvedValue({ buf: processedBuf, mediaType: 'image/webp' }),
      set: vi.fn().mockResolvedValue(undefined),
    } as any;

    const msg = makeUserMsgWithAttachment('u1', 'cached', {
      id: 'att-1',
      mediaType: 'image/png',
      sizeBytes: rawBuf.length,
      fileName: 'photo.png',
    });

    const blobReader = async () => rawBuf;
    const caps = makeVisionCapabilities();

    const result = await convertAgentMessagesToModelMessages(
      [msg],
      '',
      {},
      0,
      agentId,
      blobReader,
      caps,
      undefined, // onBlobError
      undefined, // currentModelId
      undefined, // shellInfo
      undefined, // skillDetails
      undefined, // logger
      mockCache,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const imgs = getImageParts(userMsg);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].mediaType).toBe('image/webp');
    // cache.get was called; cache.set was NOT (it was a hit)
    expect(mockCache.get).toHaveBeenCalledOnce();
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('image is not emitted when model has no image modality', async () => {
    const rawBuf = await makePng(200, 200);
    const msg = makeUserMsgWithAttachment('u1', 'no vision', {
      id: 'att-1',
      mediaType: 'image/png',
      sizeBytes: rawBuf.length,
      fileName: 'photo.png',
    });

    const blobReader = async () => rawBuf;
    const caps = makeTextOnlyCapabilities();

    const result = await convertAgentMessagesToModelMessages(
      [msg],
      '',
      {},
      0,
      agentId,
      blobReader,
      caps,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    // No ImagePart emitted
    expect(getImageParts(userMsg)).toHaveLength(0);
    // But an XML hint text part IS present describing the attachment
    const texts = getUserMsgTexts(userMsg);
    expect(texts.some((t) => t.includes('photo.png'))).toBe(true);
  });

  it('corrupt image buffer emits error hint instead of ImagePart', async () => {
    const corruptBuf = Buffer.from('not-an-image');
    const msg = makeUserMsgWithAttachment('u1', 'bad image', {
      id: 'att-1',
      mediaType: 'image/png',
      sizeBytes: corruptBuf.length,
      fileName: 'bad.png',
    });

    const blobReader = async () => corruptBuf;
    const caps = makeVisionCapabilities();

    const result = await convertAgentMessagesToModelMessages(
      [msg],
      '',
      {},
      0,
      agentId,
      blobReader,
      caps,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    expect(getImageParts(userMsg)).toHaveLength(0);
    const texts = getUserMsgTexts(userMsg);
    expect(
      texts.some(
        (t) =>
          t.toLowerCase().includes('could not be processed') ||
          t.includes('bad.png'),
      ),
    ).toBe(true);
  });

  it('non-image file (PDF) becomes FilePart, not ImagePart', async () => {
    const pdfBuf = makeFakePdf();
    const msg = makeUserMsgWithAttachment('u1', 'doc attached', {
      id: 'att-1',
      mediaType: 'application/pdf',
      sizeBytes: pdfBuf.length,
      fileName: 'doc.pdf',
    });

    const blobReader = async () => pdfBuf;
    const caps = makeFileCapabilities();

    const result = await convertAgentMessagesToModelMessages(
      [msg],
      '',
      {},
      0,
      agentId,
      blobReader,
      caps,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    expect(getImageParts(userMsg)).toHaveLength(0);
    expect(getFileParts(userMsg)).toHaveLength(1);
    expect(getFileParts(userMsg)[0].mediaType).toBe('application/pdf');
  });

  it('large image (>2048px) is downscaled before being emitted', async () => {
    const rawBuf = await makePng(3000, 3000);
    const msg = makeUserMsgWithAttachment('u1', 'big image', {
      id: 'att-1',
      mediaType: 'image/png',
      sizeBytes: rawBuf.length,
      fileName: 'big.png',
    });

    const blobReader = async () => rawBuf;
    const caps = makeVisionCapabilities();

    const result = await convertAgentMessagesToModelMessages(
      [msg],
      '',
      {},
      0,
      agentId,
      blobReader,
      caps,
    );

    const userMsg = result.find((m) => m.role === 'user')!;
    const imgs = getImageParts(userMsg);
    expect(imgs).toHaveLength(1);
    // Verify it was actually compressed (output smaller than a 3000×3000 raw PNG)
    const outBuf = Buffer.from(imgs[0].image);
    expect(outBuf.length).toBeLessThan(rawBuf.length);
    // And it is valid WebP
    const meta = await sharp(outBuf).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(2048);
    expect(meta.height).toBeLessThanOrEqual(2048);
  });
});

// =============================================================================
// Image attachment pipeline — sandbox-produced attachments (after assistant turn)
// =============================================================================

function makeAssistantMsgWithSandboxAttachment(
  id: string,
  text: string,
  attachment: {
    id: string;
    mediaType: string;
    sizeBytes: number;
    fileName: string;
  },
  snapshot?: any,
): AgentMessage {
  return {
    id,
    role: 'assistant',
    // The sandbox attachment lives inside a tool-result part's `output._customFileAttachments`
    // array — that is what `collectCustomFileAttachments` reads.
    parts: [
      { type: 'text', text, state: 'done' },
      {
        type: 'tool-result',
        toolCallId: 'tc-1',
        toolName: 'execute_script',
        output: {
          _customFileAttachments: [attachment],
          result: 'ok',
        },
        state: 'output-available',
      },
    ],
    metadata: {
      createdAt: new Date(),
      partsMetadata: [],
      environmentSnapshot: snapshot,
    },
  } as any;
}

describe('image attachment pipeline — sandbox-produced attachments (buildSyntheticUserMessageForAttachments)', () => {
  const agentId = 'agent-1';

  it('sandbox PNG image is processed to WebP and emitted as ImagePart in synthetic message', async () => {
    const rawBuf = await makePng(200, 200);
    const snap = makeSnapshot();
    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'run something', snap),
      makeAssistantMsgWithSandboxAttachment(
        'a1',
        'done',
        {
          id: 'sb-1',
          mediaType: 'image/png',
          sizeBytes: rawBuf.length,
          fileName: 'result.png',
        },
        snap,
      ),
    ];

    const blobReader = async () => rawBuf;
    const caps = makeVisionCapabilities();

    const result = await convertAgentMessagesToModelMessages(
      messages,
      '',
      {},
      0,
      agentId,
      blobReader,
      caps,
    );

    // The synthetic user message is injected AFTER all assistant/tool messages
    // for that turn. Find the last user message in the result.
    const syntheticMsg = [...result].reverse().find((m) => m.role === 'user')!;
    expect(syntheticMsg).toBeDefined();
    expect(syntheticMsg.role).toBe('user');

    const imgs = getImageParts(syntheticMsg);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].mediaType).toBe('image/webp');
  });

  it('sandbox image uses cache on second call', async () => {
    const rawBuf = await makePng(200, 200);
    const processedBuf = await makeWebp(200, 200);
    const snap = makeSnapshot();

    const mockCache = {
      get: vi
        .fn()
        .mockResolvedValue({ buf: processedBuf, mediaType: 'image/webp' }),
      set: vi.fn().mockResolvedValue(undefined),
    } as any;

    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'go', snap),
      makeAssistantMsgWithSandboxAttachment(
        'a1',
        'done',
        {
          id: 'sb-1',
          mediaType: 'image/png',
          sizeBytes: rawBuf.length,
          fileName: 'out.png',
        },
        snap,
      ),
    ];

    const blobReader = async () => rawBuf;
    const caps = makeVisionCapabilities();

    const result = await convertAgentMessagesToModelMessages(
      messages,
      '',
      {},
      0,
      agentId,
      blobReader,
      caps,
      undefined, // onBlobError
      undefined, // currentModelId
      undefined, // shellInfo
      undefined, // skillDetails
      undefined, // logger
      mockCache,
    );

    const syntheticMsg = [...result].reverse().find((m) => m.role === 'user')!;
    expect(syntheticMsg).toBeDefined();
    const imgs = getImageParts(syntheticMsg);
    expect(imgs).toHaveLength(1);
    expect(mockCache.get).toHaveBeenCalledOnce();
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('sandbox image not emitted when model has no image modality', async () => {
    const rawBuf = await makePng(100, 100);
    const snap = makeSnapshot();

    const messages: AgentMessage[] = [
      makeUserMsg('u1', 'go', snap),
      makeAssistantMsgWithSandboxAttachment(
        'a1',
        'done',
        {
          id: 'sb-1',
          mediaType: 'image/png',
          sizeBytes: rawBuf.length,
          fileName: 'out.png',
        },
        snap,
      ),
    ];

    const blobReader = async () => rawBuf;
    const caps = makeTextOnlyCapabilities();

    const result = await convertAgentMessagesToModelMessages(
      messages,
      '',
      {},
      0,
      agentId,
      blobReader,
      caps,
    );

    const syntheticMsg = [...result].reverse().find((m) => m.role === 'user')!;
    expect(syntheticMsg).toBeDefined();
    expect(getImageParts(syntheticMsg)).toHaveLength(0);
    // XML hint text part still present
    const texts = getUserMsgTexts(syntheticMsg);
    expect(texts.some((t) => t.includes('out.png'))).toBe(true);
  });
});

// =============================================================================
// canModelConsumeAttachment / effectiveMimeAndSize — pure logic
// =============================================================================

// These are not exported so we exercise them via convertAgentMessagesToModelMessages.
// The observable effect is whether an inline part appears in the output.

describe('image attachment — constraint gating behaviour', () => {
  const agentId = 'agent-1';

  it('image modality disabled: no ImagePart even when MIME matches', async () => {
    const rawBuf = await makePng(100, 100);
    const msg = makeUserMsgWithAttachment('u1', 'hi', {
      id: 'att-1',
      mediaType: 'image/png',
      sizeBytes: rawBuf.length,
      fileName: 'photo.png',
    });

    // Vision explicitly disabled
    const caps: ModelCapabilities = {
      inputModalities: {
        text: true,
        image: false,
        file: false,
        audio: false,
        video: false,
      },
      outputModalities: {
        text: true,
        image: false,
        file: false,
        audio: false,
        video: false,
      },
      toolCalling: true,
      inputConstraints: {
        image: { mimeTypes: ['image/webp', 'image/png'], maxBytes: 5_242_880 },
      },
    };

    const result = await convertAgentMessagesToModelMessages(
      [msg],
      '',
      {},
      0,
      agentId,
      async () => rawBuf,
      caps,
    );
    const userMsg = result.find((m) => m.role === 'user')!;
    expect(getImageParts(userMsg)).toHaveLength(0);
  });

  it('model with no capabilities at all: no inline part emitted', async () => {
    const rawBuf = await makePng(100, 100);
    const msg = makeUserMsgWithAttachment('u1', 'hi', {
      id: 'att-1',
      mediaType: 'image/png',
      sizeBytes: rawBuf.length,
      fileName: 'photo.png',
    });

    const result = await convertAgentMessagesToModelMessages(
      [msg],
      '',
      {},
      0,
      agentId,
      async () => rawBuf,
      undefined, // no capabilities
    );
    const userMsg = result.find((m) => m.role === 'user')!;
    expect(getImageParts(userMsg)).toHaveLength(0);
  });

  it('image passed without imageConstraint falls through as-is (no constraint fallback)', async () => {
    // Model supports images but has no inputConstraints defined
    const rawBuf = await makePng(100, 100);
    const msg = makeUserMsgWithAttachment('u1', 'hi', {
      id: 'att-1',
      mediaType: 'image/png',
      sizeBytes: rawBuf.length,
      fileName: 'photo.png',
    });

    const caps: ModelCapabilities = {
      inputModalities: {
        text: true,
        image: true,
        file: false,
        audio: false,
        video: false,
      },
      outputModalities: {
        text: true,
        image: false,
        file: false,
        audio: false,
        video: false,
      },
      toolCalling: true,
      // No inputConstraints — processImageForModel won't run, raw buffer used
    };

    const result = await convertAgentMessagesToModelMessages(
      [msg],
      '',
      {},
      0,
      agentId,
      async () => rawBuf,
      caps,
    );
    const userMsg = result.find((m) => m.role === 'user')!;
    const imgs = getImageParts(userMsg);
    // Raw PNG still emitted as-is (no constraint = no processor)
    expect(imgs).toHaveLength(1);
    expect(imgs[0].mediaType).toBe('image/png');
  });
});
