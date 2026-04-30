import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocking strategy: child_process.execFile is promisified inside the module
// under test, so we mock the module itself to hand back deterministic stdout.
// Every test starts from a pristine mock to avoid leaking stubs across cases.
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import {
  PROCESS_FILTER_TOKENS,
  captureProcessSnapshot,
} from './process-snapshot';

const execFileMock = execFile as unknown as ReturnType<typeof vi.fn>;

function mockPsStdout(lines: string[]) {
  execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
    // Node's execFile signature is execFile(file, args, opts, cb). When the
    // promisified wrapper is used, it always supplies a callback.
    cb?.(null, { stdout: lines.join('\n'), stderr: '' });
  });
}

function mockExecFailure(err: Error) {
  execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
    cb?.(err, { stdout: '', stderr: String(err) });
  });
}

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
  });
}

describe('PROCESS_FILTER_TOKENS', () => {
  it('is a non-empty, lower-cased, unique list', () => {
    expect(PROCESS_FILTER_TOKENS.length).toBeGreaterThan(0);
    for (const token of PROCESS_FILTER_TOKENS) {
      expect(token).toBe(token.toLowerCase());
    }
    expect(new Set(PROCESS_FILTER_TOKENS).size).toBe(
      PROCESS_FILTER_TOKENS.length,
    );
  });

  it('includes the canonical AI/IDE tool tokens from the plan', () => {
    const required = [
      'cursor',
      'claude',
      'codex',
      'vscode',
      'zed',
      'conductor',
      'opencode',
      'openwork',
      'cowork',
    ];
    for (const token of required) {
      expect(PROCESS_FILTER_TOKENS).toContain(token);
    }
  });
});

describe('captureProcessSnapshot (posix: ps)', () => {
  beforeEach(() => {
    setPlatform('darwin');
    execFileMock.mockReset();
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
  });

  it('returns empty counts when no process matches any token', async () => {
    mockPsStdout(['bash', 'node', 'zsh', 'kernel_task']);

    const snap = await captureProcessSnapshot();

    expect(snap).toEqual({ matched_process_counts: {}, total_matched: 0 });
  });

  it('counts multiple matches per token', async () => {
    mockPsStdout([
      'Cursor',
      '/Applications/Cursor.app/Contents/MacOS/Cursor Helper (Renderer)',
      'Claude',
      'zsh',
    ]);

    const snap = await captureProcessSnapshot();

    expect(snap.matched_process_counts.cursor).toBe(2);
    expect(snap.matched_process_counts.claude).toBe(1);
    expect(snap.total_matched).toBe(3);
  });

  it('matches case-insensitively on the basename only', async () => {
    // The full path contains "cursor" as a directory segment. We must match
    // the basename ("vim"), NOT the directory, otherwise every file under
    // ~/cursor-project would count.
    mockPsStdout(['/Users/alice/cursor-project/bin/vim']);

    const snap = await captureProcessSnapshot();

    expect(snap.total_matched).toBe(0);
    expect(snap.matched_process_counts).toEqual({});
  });

  it('counts each process once using the first matching token', async () => {
    mockPsStdout(['vscode-helper', 'opencode']);

    const snap = await captureProcessSnapshot();

    expect(snap.matched_process_counts.vscode).toBe(1);
    expect(snap.matched_process_counts.opencode).toBe(1);
    expect(snap.total_matched).toBe(2);
  });

  it('does not match unrelated process names that merely contain code-like substrings', async () => {
    mockPsStdout(['Xcode', 'AppCode', 'xcodebuild', 'StatusMenuBarHelper']);

    const snap = await captureProcessSnapshot();

    expect(snap).toEqual({ matched_process_counts: {}, total_matched: 0 });
  });

  it('ignores blank lines and trims whitespace', async () => {
    mockPsStdout(['', '   Claude   ', '', '\t', 'zsh']);

    const snap = await captureProcessSnapshot();

    expect(snap.matched_process_counts.claude).toBe(1);
    expect(snap.total_matched).toBe(1);
  });

  it('returns an empty snapshot when execFile fails', async () => {
    mockExecFailure(new Error('spawn EACCES'));

    const snap = await captureProcessSnapshot();

    expect(snap).toEqual({ matched_process_counts: {}, total_matched: 0 });
  });

  it('never throws even on malformed stdout', async () => {
    mockPsStdout([null as unknown as string]);

    await expect(captureProcessSnapshot()).resolves.toEqual({
      matched_process_counts: {},
      total_matched: 0,
    });
  });

  it('passes the configured timeout through to execFile', async () => {
    mockPsStdout(['zsh']);

    await captureProcessSnapshot(500);

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const opts = execFileMock.mock.calls[0][2] as { timeout: number };
    expect(opts.timeout).toBe(500);
  });

  it('defaults to a 1500ms timeout when no override is given', async () => {
    mockPsStdout(['zsh']);

    await captureProcessSnapshot();

    const opts = execFileMock.mock.calls[0][2] as { timeout: number };
    expect(opts.timeout).toBe(1500);
  });

  it('uses ps -Ao comm= on non-Windows platforms', async () => {
    mockPsStdout(['zsh']);

    await captureProcessSnapshot();

    const [cmd, args] = execFileMock.mock.calls[0];
    expect(cmd).toBe('ps');
    expect(args).toEqual(['-Ao', 'comm=']);
  });
});

describe('captureProcessSnapshot (win32: tasklist)', () => {
  beforeEach(() => {
    setPlatform('win32');
    execFileMock.mockReset();
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
  });

  it('parses CSV output from tasklist', async () => {
    // tasklist's /fo csv /nh output format:
    //   "image name","pid","session","session#","mem"
    const csv = [
      '"System Idle Process","0","Services","0","8 K"',
      '"Cursor.exe","1234","Console","1","128,000 K"',
      '"Code.exe","5678","Console","1","64,000 K"',
      '"chrome.exe","9999","Console","1","200,000 K"',
    ];
    mockPsStdout(csv);

    const snap = await captureProcessSnapshot();

    expect(snap.matched_process_counts.cursor).toBe(1);
    expect(snap.matched_process_counts.vscode).toBeUndefined();
    expect(snap.matched_process_counts.zed).toBeUndefined();
    expect(snap.total_matched).toBe(1);
  });

  it('uses tasklist /fo csv /nh on win32', async () => {
    mockPsStdout([]);

    await captureProcessSnapshot();

    const [cmd, args] = execFileMock.mock.calls[0];
    expect(cmd).toBe('tasklist');
    expect(args).toEqual(['/fo', 'csv', '/nh']);
  });

  it('skips rows that do not begin with a quoted image name', async () => {
    mockPsStdout([
      'not,a,quoted,row',
      '"Claude.exe","1","Console","1","1 K"',
      '',
    ]);

    const snap = await captureProcessSnapshot();

    expect(snap.total_matched).toBe(1);
    expect(snap.matched_process_counts.claude).toBe(1);
  });
});
