import { describe, expect, it } from 'vitest';
import {
  buildProcessTreeSnapshots,
  normalizeListeningHost,
  parseLsofListeningSnapshot,
  parseUnixProcessSnapshot,
  parseWindowsListeningSnapshot,
  parseWindowsProcessSnapshot,
} from './port-utils';

describe('normalizeListeningHost', () => {
  it.each([
    '*',
    '0.0.0.0',
    '::',
    '::0',
    '127.0.0.1',
    '::1',
  ])('normalizes %s to localhost', (host) => {
    expect(normalizeListeningHost(host)).toBe('localhost');
  });

  it('preserves a concrete interface address', () => {
    expect(normalizeListeningHost('192.168.1.42')).toBe('192.168.1.42');
  });

  it('removes brackets from an IPv6 address', () => {
    expect(normalizeListeningHost('[fe80::1]')).toBe('fe80::1');
  });
});

describe('process snapshots', () => {
  it('parses complete commands from ps output', () => {
    expect(
      parseUnixProcessSnapshot(
        '  10  1 S /bin/zsh\n  11  10 S node server.js --port 3000\n',
      ),
    ).toEqual([
      { pid: 10, parentPid: 1, state: 'S', command: '/bin/zsh' },
      {
        pid: 11,
        parentPid: 10,
        state: 'S',
        command: 'node server.js --port 3000',
      },
    ]);
  });

  it('parses IPv4, IPv6 and wildcard lsof endpoints by pid', () => {
    const snapshot = parseLsofListeningSnapshot(
      'p11\nf20\nn*:3000\nf21\nn[::1]:3001\np12\nn192.168.1.42:4000\n',
    );

    expect(snapshot.get(11)).toEqual([
      { host: 'localhost', port: 3000 },
      { host: 'localhost', port: 3001 },
    ]);
    expect(snapshot.get(12)).toEqual([{ host: '192.168.1.42', port: 4000 }]);
  });

  it('groups descendant endpoints and uses the active child command', () => {
    const snapshots = buildProcessTreeSnapshots(
      [10],
      [
        { pid: 10, parentPid: 1, state: 'S', command: '/bin/zsh' },
        { pid: 11, parentPid: 10, state: 'S', command: 'pnpm dev' },
        { pid: 12, parentPid: 11, state: 'S', command: 'node server.js' },
        { pid: 13, parentPid: 10, state: 'Z', command: 'old command' },
      ],
      new Map([
        [11, [{ host: 'localhost', port: 3000 }]],
        [12, [{ host: 'localhost', port: 3001 }]],
      ]),
    );

    expect(snapshots.get(10)).toEqual({
      command: 'pnpm dev',
      endpoints: [
        { host: 'localhost', port: 3000 },
        { host: 'localhost', port: 3001 },
      ],
    });
  });

  it('parses Windows process commands and listening endpoints', () => {
    expect(
      parseWindowsProcessSnapshot(
        JSON.stringify({
          ProcessId: 11,
          ParentProcessId: 10,
          Name: 'node.exe',
          CommandLine: 'node server.js --port 3000',
        }),
      ),
    ).toEqual([
      {
        pid: 11,
        parentPid: 10,
        state: '',
        command: 'node server.js --port 3000',
      },
    ]);

    expect(
      parseWindowsListeningSnapshot(
        JSON.stringify({
          LocalAddress: '::1',
          LocalPort: 3000,
          OwningProcess: 11,
        }),
      ).get(11),
    ).toEqual([{ host: 'localhost', port: 3000 }]);
  });
});
