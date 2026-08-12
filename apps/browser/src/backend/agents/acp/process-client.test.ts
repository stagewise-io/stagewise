import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ClientConnection } from '@agentclientprotocol/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@/services/logger';
import { ACP_ADAPTERS } from './adapter-registry';
import { AcpProcessClient } from './process-client';

type ProcessClientInternals = {
  child: ChildProcessWithoutNullStreams | null;
  connection: ClientConnection | null;
  isRunning(): boolean;
  handleConnectionClosed(connection: ClientConnection): void;
};

describe('AcpProcessClient', () => {
  it('invalidates a live process when its ACP connection closes', () => {
    const child = {
      pid: undefined,
      stdin: { end: vi.fn() },
    } as unknown as ChildProcessWithoutNullStreams;
    const connection = {
      close: vi.fn(),
    } as unknown as ClientConnection;
    const client = new AcpProcessClient(
      ACP_ADAPTERS.codex,
      {} as never,
      { debug: vi.fn(), warn: vi.fn() } as unknown as Logger,
      () => Promise.resolve({}),
    ) as unknown as ProcessClientInternals;
    client.child = child;
    client.connection = connection;

    client.handleConnectionClosed(connection);

    expect(client.isRunning()).toBe(false);
    expect(connection.close).toHaveBeenCalledOnce();
    expect(child.stdin.end).toHaveBeenCalledOnce();
  });
});
