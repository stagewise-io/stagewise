/**
 * Integration tests for the env-state slice of `convertAgentMessagesToModelMessages`.
 *
 * Exercises the keyframe → delta sequence the conversion pipeline emits
 * when walking persisted `metadata.envState` entries forward from the
 * compression boundary.
 */
import { describe, expect, it } from 'vitest';
import type {
  TextPart,
  ImagePart,
  FilePart,
  ModelMessage,
  UserModelMessage,
} from 'ai';
import { convertAgentMessagesToModelMessages } from './message-conversion';
import {
  DomainAdapterRegistry,
  type DomainAdapter,
  type EnvStateEntry,
} from '../../env/contract';
import type { AgentMessage } from '../../types/agent';
import type { HostPaths } from '../../host/paths';

const HOST_PATHS = {} as unknown as HostPaths;
const BLOB_READER = async () => Buffer.alloc(0);

function makeMessage(
  role: 'user' | 'assistant',
  text: string,
  envState?: Record<string, EnvStateEntry>,
): AgentMessage {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    role,
    parts: [{ type: 'text', text }],
    metadata: {
      createdAt: new Date(),
      partsMetadata: [],
      ...(envState ? { envState } : {}),
    },
  } as unknown as AgentMessage;
}

function makeAdapter<TState>(
  domainId: string,
  renderOrder: number,
): DomainAdapter<TState> {
  return {
    domainId,
    renderOrder,
    getState: () => null as unknown as TState,
    renderState: () => '',
  };
}

function extractUserContent(msg: ModelMessage | undefined): string {
  if (!msg || msg.role !== 'user') return '';
  const u = msg as UserModelMessage;
  if (typeof u.content === 'string') return u.content;
  return (u.content as (TextPart | ImagePart | FilePart)[])
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text)
    .join('\n---\n');
}

describe('convertAgentMessagesToModelMessages – env-state pipeline', () => {
  it('emits the per-domain keyframe on the first message with envState', async () => {
    const registry = new DomainAdapterRegistry();
    registry.register(makeAdapter('browser', 0));
    registry.register(makeAdapter('workspace', 1));

    const msg = makeMessage('user', 'hi', {
      browser: {
        schemaVersion: 1,
        state: null,
        renderedState: '<open-tabs>FULL_BROWSER</open-tabs>',
        renderedStateChange: '<open-tabs>FULL_BROWSER</open-tabs>',
      },
      workspace: {
        schemaVersion: 1,
        state: null,
        renderedState: '<symlinks>FULL_WS</symlinks>',
        renderedStateChange: '<symlinks>FULL_WS</symlinks>',
      },
    });

    const result = await convertAgentMessagesToModelMessages(
      [msg],
      'SYS',
      {},
      'agent-1',
      {
        host: HOST_PATHS,
        blobReader: BLOB_READER,
        domainAdapterRegistry: registry,
      },
    );

    // system + 1 user
    expect(result).toHaveLength(2);
    const text = extractUserContent(result[1]);
    expect(text).toContain('<open-tabs>FULL_BROWSER</open-tabs>');
    expect(text).toContain('<symlinks>FULL_WS</symlinks>');
    // Domain order follows renderOrder: browser (0) before workspace (1).
    expect(text.indexOf('FULL_BROWSER')).toBeLessThan(text.indexOf('FULL_WS'));
  });

  it('emits per-domain diff blocks on subsequent messages', async () => {
    const registry = new DomainAdapterRegistry();
    registry.register(makeAdapter('browser', 0));

    const m1 = makeMessage('user', 'first', {
      browser: {
        schemaVersion: 1,
        state: null,
        renderedState: '<open-tabs>KEYFRAME</open-tabs>',
        renderedStateChange: '<open-tabs>KEYFRAME</open-tabs>',
      },
    });
    const m2 = makeMessage('assistant', 'ok');
    const m3 = makeMessage('user', 'second', {
      browser: {
        schemaVersion: 1,
        state: null,
        renderedState: '<open-tabs>STATE_AT_M3</open-tabs>',
        renderedStateChange: '<env-changes>tab-opened</env-changes>',
      },
    });

    const result = await convertAgentMessagesToModelMessages(
      [m1, m2, m3],
      'SYS',
      {},
      'agent-1',
      {
        host: HOST_PATHS,
        blobReader: BLOB_READER,
        domainAdapterRegistry: registry,
      },
    );

    const firstUserText = extractUserContent(result[1]);
    expect(firstUserText).toContain('<open-tabs>KEYFRAME</open-tabs>');

    // m3 is the last message in the result (after system, m1, assistant).
    const m3UserText = extractUserContent(result[result.length - 1]);
    expect(m3UserText).toContain('<env-changes>tab-opened</env-changes>');
    expect(m3UserText).not.toContain('<open-tabs>STATE_AT_M3</open-tabs>');
  });

  it('walks pre-boundary history when the boundary message lacks envState', async () => {
    const registry = new DomainAdapterRegistry();
    registry.register(makeAdapter('workspace', 1));

    // m0 carries the keyframe for `workspace`; m1 is the compression
    // boundary and has no envState of its own — conversion should
    // inherit m0's renderedState as the keyframe.
    const m0 = makeMessage('user', 'older', {
      workspace: {
        schemaVersion: 1,
        state: null,
        renderedState: '<symlinks>INHERITED</symlinks>',
        renderedStateChange: '<symlinks>INHERITED</symlinks>',
      },
    });
    const m1: AgentMessage = {
      ...makeMessage('user', 'boundary'),
      metadata: {
        ...(makeMessage('user', 'boundary').metadata as Record<
          string,
          unknown
        >),
        compressedHistory: 'compressed-stuff',
      },
    } as unknown as AgentMessage;

    const result = await convertAgentMessagesToModelMessages(
      [m0, m1],
      'SYS',
      {},
      'agent-1',
      {
        host: HOST_PATHS,
        blobReader: BLOB_READER,
        domainAdapterRegistry: registry,
      },
    );

    // After compression-boundary filtering, only m1 is rendered (plus system).
    expect(result).toHaveLength(2);
    const text = extractUserContent(result[1]);
    expect(text).toContain('<symlinks>INHERITED</symlinks>');
    expect(text).toContain('compressed-stuff');
  });

  it('filters keyframe and delta blocks by allowedEnvDomainIds', async () => {
    const registry = new DomainAdapterRegistry();
    registry.register(makeAdapter('browser', 0));
    registry.register(makeAdapter('workspace', 1));

    const m1 = makeMessage('user', 'first', {
      browser: {
        schemaVersion: 1,
        state: null,
        renderedState: '<open-tabs>BROWSER_FULL</open-tabs>',
        renderedStateChange: '<open-tabs>BROWSER_FULL</open-tabs>',
      },
      workspace: {
        schemaVersion: 1,
        state: null,
        renderedState: '<symlinks>WORKSPACE_FULL</symlinks>',
        renderedStateChange: '<symlinks>WORKSPACE_FULL</symlinks>',
      },
    });
    const m2 = makeMessage('assistant', 'ok');
    const m3 = makeMessage('user', 'second', {
      browser: {
        schemaVersion: 1,
        state: null,
        renderedState: '<open-tabs>BROWSER_M3</open-tabs>',
        renderedStateChange: '<env-changes>browser-delta</env-changes>',
      },
      workspace: {
        schemaVersion: 1,
        state: null,
        renderedState: '<symlinks>WORKSPACE_M3</symlinks>',
        renderedStateChange: '<env-changes>workspace-delta</env-changes>',
      },
    });

    const result = await convertAgentMessagesToModelMessages(
      [m1, m2, m3],
      'SYS',
      {},
      'agent-1',
      {
        host: HOST_PATHS,
        blobReader: BLOB_READER,
        domainAdapterRegistry: registry,
        allowedEnvDomainIds: ['workspace'],
      },
    );

    const firstUserText = extractUserContent(result[1]);
    expect(firstUserText).toContain('<symlinks>WORKSPACE_FULL</symlinks>');
    expect(firstUserText).not.toContain('BROWSER_FULL');

    const m3UserText = extractUserContent(result[result.length - 1]);
    expect(m3UserText).toContain('<env-changes>workspace-delta</env-changes>');
    expect(m3UserText).not.toContain('browser-delta');
  });

  it('emits no env block when allowedEnvDomainIds is an empty array', async () => {
    const registry = new DomainAdapterRegistry();
    registry.register(makeAdapter('browser', 0));

    const m1 = makeMessage('user', 'first', {
      browser: {
        schemaVersion: 1,
        state: null,
        renderedState: '<open-tabs>FULL</open-tabs>',
        renderedStateChange: '<open-tabs>FULL</open-tabs>',
      },
    });

    const result = await convertAgentMessagesToModelMessages(
      [m1],
      'SYS',
      {},
      'agent-1',
      {
        host: HOST_PATHS,
        blobReader: BLOB_READER,
        domainAdapterRegistry: registry,
        allowedEnvDomainIds: [],
      },
    );

    const text = extractUserContent(result[1]);
    expect(text).not.toContain('<open-tabs>FULL</open-tabs>');
  });

  it('emits no env block when envState is empty across the window', async () => {
    const m1 = makeMessage('user', 'hello');
    const m2 = makeMessage('assistant', 'ok');

    const result = await convertAgentMessagesToModelMessages(
      [m1, m2],
      'SYS',
      {},
      'agent-1',
      { host: HOST_PATHS, blobReader: BLOB_READER },
    );

    const userText = extractUserContent(result[1]);
    expect(userText).not.toContain('<open-tabs');
    expect(userText).not.toContain('<symlinks');
    expect(userText).not.toContain('<env-changes');
  });
});
