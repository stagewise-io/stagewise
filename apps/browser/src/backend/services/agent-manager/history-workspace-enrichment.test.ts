import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enrichHistoryEntryWorkspaces } from './history-workspace-enrichment';
import type {
  AgentHistoryEntry,
  AgentHistoryWorkspaceEntry,
} from '@shared/karton-contracts/ui/agent';

function makeEntry(
  id: string,
  mountedWorkspaces: AgentHistoryWorkspaceEntry[] | null | undefined,
): AgentHistoryEntry {
  return {
    id,
    title: `Agent ${id}`,
    createdAt: new Date(0),
    lastMessageAt: new Date(0),
    messageCount: 0,
    parentAgentInstanceId: null,
    mountedWorkspaces,
  };
}

const realDirs: string[] = [];

async function mkRealDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  realDirs.push(dir);
  return dir;
}

beforeEach(() => {
  realDirs.length = 0;
});

afterEach(async () => {
  for (const dir of realDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('enrichHistoryEntryWorkspaces', () => {
  it('resolves a fresh git summary per surviving mount', async () => {
    const ws = await mkRealDir('history-ws');
    const summary = {
      repositoryId: `${ws}/.git`,
    } as unknown as AgentHistoryWorkspaceEntry['git'];
    const getGitSummary = vi.fn(async () => summary);

    const entries = [
      makeEntry('a', [{ path: ws, permissions: ['read'], git: null }]),
    ];

    const enriched = await enrichHistoryEntryWorkspaces(entries, getGitSummary);

    expect(enriched).toHaveLength(1);
    expect(enriched[0]?.mountedWorkspaces).toEqual([
      { path: ws, permissions: ['read'], git: summary },
    ]);
    expect(getGitSummary).toHaveBeenCalledTimes(1);
  });

  it('filters out workspaces whose directory no longer exists on disk', async () => {
    const kept = await mkRealDir('history-kept');
    const deleted = path.join(
      os.tmpdir(),
      `history-deleted-${Date.now()}-${Math.random()}`,
    );
    const summary = {
      repositoryId: 'r',
    } as unknown as AgentHistoryWorkspaceEntry['git'];
    const getGitSummary = vi.fn(async () => summary);

    const entries = [
      makeEntry('a', [
        { path: deleted, permissions: ['read'], git: null },
        { path: kept, permissions: ['read'], git: null },
      ]),
    ];

    const enriched = await enrichHistoryEntryWorkspaces(entries, getGitSummary);

    expect(enriched[0]?.mountedWorkspaces).toEqual([
      { path: kept, permissions: ['read'], git: summary },
    ]);
    // The deleted path is never queried — its existence check fails first.
    expect(getGitSummary).toHaveBeenCalledTimes(1);
    expect(getGitSummary).toHaveBeenCalledWith(kept);
  });

  it('deduplicates git lookups across entries that share a workspace', async () => {
    const ws = await mkRealDir('history-shared-ws');
    const summary = {
      repositoryId: 'r',
    } as unknown as AgentHistoryWorkspaceEntry['git'];
    const getGitSummary = vi.fn(async () => summary);

    const entries = [
      makeEntry('a', [{ path: ws, permissions: ['read'], git: null }]),
      makeEntry('b', [{ path: ws, permissions: ['read'], git: null }]),
      makeEntry('c', [{ path: ws, permissions: ['read'], git: null }]),
    ];

    await enrichHistoryEntryWorkspaces(entries, getGitSummary);

    expect(getGitSummary).toHaveBeenCalledTimes(1);
  });

  it('falls back to null git on resolver error and warns', async () => {
    const ws = await mkRealDir('history-error-ws');
    const getGitSummary = vi.fn(async () => {
      throw new Error('boom');
    });
    const warn = vi.fn();

    const entries = [
      makeEntry('a', [{ path: ws, permissions: ['read'], git: null }]),
    ];

    const enriched = await enrichHistoryEntryWorkspaces(
      entries,
      getGitSummary,
      { warn },
    );

    expect(enriched[0]?.mountedWorkspaces).toEqual([
      { path: ws, permissions: ['read'], git: null },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('preserves entries with null/undefined mountedWorkspaces verbatim', async () => {
    const getGitSummary = vi.fn();

    const entries = [makeEntry('null', null), makeEntry('undef', undefined)];

    const enriched = await enrichHistoryEntryWorkspaces(entries, getGitSummary);

    expect(enriched[0]?.mountedWorkspaces).toBeNull();
    expect(enriched[1]?.mountedWorkspaces).toBeUndefined();
    expect(getGitSummary).not.toHaveBeenCalled();
  });
});
