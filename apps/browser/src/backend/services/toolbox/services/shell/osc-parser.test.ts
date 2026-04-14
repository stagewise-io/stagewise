import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OscParser,
  stripOsc133,
  wrapWithSentinel,
  type CommandDoneEvent,
} from './osc-parser';

// ─── Helpers ──────────────────────────────────────────────────────

/** BEL-terminated OSC 133 sequence */
const osc = (marker: string, param?: string) =>
  `\x1b]133;${marker}${param != null ? `;${param}` : ''}\x07`;

/** ST-terminated OSC 133 sequence */
const oscST = (marker: string, param?: string) =>
  `\x1b]133;${marker}${param != null ? `;${param}` : ''}\x1b\\`;

/** Construct a sentinel string */
const sentinel = (id: string, exitCode: number) =>
  `__STAGE_DONE_${id}_${exitCode}__`;

// ─── OSC 133 parsing ─────────────────────────────────────────────

describe('OscParser — OSC 133 mode', () => {
  let parser: OscParser;

  beforeEach(() => {
    parser = new OscParser();
  });

  it('detects shell integration on first OSC 133 sequence', () => {
    const spy = vi.fn();
    parser.on('integrationDetected', spy);
    parser.write(osc('A'));
    expect(spy).toHaveBeenCalledOnce();
    expect(parser.currentMode).toBe('osc');
  });

  it('emits promptStart on 133;A', () => {
    const spy = vi.fn();
    parser.on('promptStart', spy);
    parser.write(osc('A'));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('emits promptEnd on 133;B', () => {
    const spy = vi.fn();
    parser.on('promptEnd', spy);
    parser.write(osc('B'));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('emits commandStart on 133;C', () => {
    const spy = vi.fn();
    parser.on('commandStart', spy);
    parser.write(osc('C'));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('complete A/B/C/D cycle extracts output and exit code 0', () => {
    const done = vi.fn();
    parser.on('commandDone', done);

    parser.write(osc('A'));
    parser.write(osc('B'));
    parser.write(`${osc('C')}hello world${osc('D', '0')}`);

    expect(done).toHaveBeenCalledOnce();
    const event: CommandDoneEvent = done.mock.calls[0][0];
    expect(event.output).toBe('hello world');
    expect(event.exitCode).toBe(0);
  });

  it('extracts non-zero exit code', () => {
    const done = vi.fn();
    parser.on('commandDone', done);

    parser.write(`${osc('C')}error output${osc('D', '127')}`);

    const event: CommandDoneEvent = done.mock.calls[0][0];
    expect(event.exitCode).toBe(127);
  });

  it('extracts exit code 1', () => {
    const done = vi.fn();
    parser.on('commandDone', done);

    parser.write(`${osc('C')}fail${osc('D', '1')}`);

    expect(done.mock.calls[0][0].exitCode).toBe(1);
  });

  it('handles ST-terminated sequences', () => {
    const done = vi.fn();
    parser.on('commandDone', done);

    parser.write(`${oscST('C')}output${oscST('D', '0')}`);

    const event: CommandDoneEvent = done.mock.calls[0][0];
    expect(event.output).toBe('output');
    expect(event.exitCode).toBe(0);
  });

  it('handles multiple sequential commands', () => {
    const done = vi.fn();
    parser.on('commandDone', done);

    parser.write(
      osc('A') +
        osc('B') +
        osc('C') +
        'first' +
        osc('D', '0') +
        osc('A') +
        osc('B') +
        osc('C') +
        'second' +
        osc('D', '2'),
    );

    expect(done).toHaveBeenCalledTimes(2);
    expect(done.mock.calls[0][0].output).toBe('first');
    expect(done.mock.calls[0][0].exitCode).toBe(0);
    expect(done.mock.calls[1][0].output).toBe('second');
    expect(done.mock.calls[1][0].exitCode).toBe(2);
  });

  it('handles sequences split across chunks', () => {
    const done = vi.fn();
    parser.on('commandDone', done);

    // Split the 133;C sequence across two writes
    parser.write(osc('A') + osc('B'));
    parser.write(`${osc('C')}chunk1`);
    parser.write('chunk2');
    parser.write(osc('D', '0'));

    expect(done).toHaveBeenCalledOnce();
    expect(done.mock.calls[0][0].output).toBe('chunk1chunk2');
    expect(done.mock.calls[0][0].exitCode).toBe(0);
  });

  it('handles ESC split at chunk boundary', () => {
    const done = vi.fn();
    parser.on('commandDone', done);

    parser.write(`${osc('C')}output`);
    // Split the D sequence: ESC at end of one chunk, rest in next
    parser.write('\x1b');
    parser.write(']133;D;5\x07');

    expect(done).toHaveBeenCalledOnce();
    expect(done.mock.calls[0][0].exitCode).toBe(5);
  });

  it('commandDone with no exit code param yields null', () => {
    const done = vi.fn();
    parser.on('commandDone', done);

    // D without a code param
    parser.write(`${osc('C')}out\x1b]133;D\x07`);

    expect(done).toHaveBeenCalledOnce();
    expect(done.mock.calls[0][0].exitCode).toBeNull();
  });

  it('strips embedded OSC 133 from command output', () => {
    const done = vi.fn();
    parser.on('commandDone', done);

    // Output that contains a stray 133;A inside it
    parser.write(`${osc('C')}before${osc('A')}after${osc('D', '0')}`);

    // The output should have the embedded 133;A stripped
    expect(done.mock.calls[0][0].output).toBe('beforeafter');
  });

  it('emits output events for text between sequences', () => {
    const output = vi.fn();
    parser.on('output', output);

    parser.write(`${osc('A')}prompt$${osc('B')}`);

    // 'prompt$' should be emitted as output
    expect(output).toHaveBeenCalledWith('prompt$');
  });
});

// ─── Sentinel fallback ───────────────────────────────────────────

describe('OscParser — sentinel mode', () => {
  let parser: OscParser;

  beforeEach(() => {
    parser = new OscParser();
    parser.setMode('sentinel');
  });

  it('detects sentinel and emits sentinelDone', () => {
    const spy = vi.fn();
    parser.on('sentinelDone', spy);

    parser.write(`some output${sentinel('cmd1', 0)}`);

    expect(spy).toHaveBeenCalledWith('cmd1', 0);
  });

  it('parses non-zero exit code from sentinel', () => {
    const spy = vi.fn();
    parser.on('sentinelDone', spy);

    parser.write(sentinel('cmd2', 42));

    expect(spy).toHaveBeenCalledWith('cmd2', 42);
  });

  it('handles sentinel split across chunks', () => {
    const spy = vi.fn();
    parser.on('sentinelDone', spy);

    // Split in the middle of the sentinel marker
    parser.write('output __STAGE_DONE_');
    parser.write('cmd3_7__');

    expect(spy).toHaveBeenCalledWith('cmd3', 7);
  });

  it('ignores text without sentinel', () => {
    const spy = vi.fn();
    parser.on('sentinelDone', spy);

    parser.write('just regular output\n');
    parser.write('more output\n');

    expect(spy).not.toHaveBeenCalled();
  });

  it('emits output events for command data in sentinel mode', () => {
    const outputSpy = vi.fn();
    parser.on('output', outputSpy);

    parser.write('file1.txt\nfile2.txt\n');
    parser.write(`${sentinel('cmd4', 0)}\n`);

    // Output should have been emitted for both chunks
    expect(outputSpy).toHaveBeenCalledTimes(2);
    expect(outputSpy).toHaveBeenNthCalledWith(1, 'file1.txt\nfile2.txt\n');
  });

  it('emits output before sentinelDone fires', () => {
    const order: string[] = [];
    parser.on('output', () => order.push('output'));
    parser.on('sentinelDone', () => order.push('sentinelDone'));

    parser.write(`hello world\n${sentinel('cmd5', 0)}`);

    expect(order).toEqual(['output', 'sentinelDone']);
  });
});

// ─── Detecting mode ──────────────────────────────────────────────

describe('OscParser — detecting mode', () => {
  it('starts in detecting mode', () => {
    const parser = new OscParser();
    expect(parser.currentMode).toBe('detecting');
  });

  it('switches to osc mode when OSC 133 seen', () => {
    const parser = new OscParser();
    parser.write(osc('A'));
    expect(parser.currentMode).toBe('osc');
  });

  it('detects sentinel in detecting mode', () => {
    const parser = new OscParser();
    const spy = vi.fn();
    parser.on('sentinelDone', spy);

    parser.write(sentinel('detect1', 0));

    expect(spy).toHaveBeenCalledWith('detect1', 0);
  });
});

// ─── Utilities ───────────────────────────────────────────────────

describe('stripOsc133', () => {
  it('strips BEL-terminated sequences', () => {
    expect(stripOsc133(`before${osc('C')}after`)).toBe('beforeafter');
  });

  it('strips ST-terminated sequences', () => {
    expect(stripOsc133(`before${oscST('D', '0')}after`)).toBe('beforeafter');
  });

  it('strips multiple sequences', () => {
    const input = `${osc('A')}prompt${osc('B')}${osc('C')}out${osc('D', '0')}`;
    expect(stripOsc133(input)).toBe('promptout');
  });

  it('returns plain text unchanged', () => {
    expect(stripOsc133('hello world')).toBe('hello world');
  });
});

describe('wrapWithSentinel', () => {
  it('produces valid sentinel command for bash', () => {
    const wrapped = wrapWithSentinel('abc123', 'echo hello');
    expect(wrapped).toContain('__STAGE_DONE_abc123_');
    expect(wrapped).toContain('echo hello');
    expect(wrapped).toContain('printf');
    expect(wrapped.endsWith('\r')).toBe(true);
  });

  it('escapes single quotes in command', () => {
    const wrapped = wrapWithSentinel('id1', "echo 'quoted'");
    expect(wrapped).toContain("\\'");
  });

  it('uses printf for sh shell', () => {
    const wrapped = wrapWithSentinel('id2', 'ls');
    expect(wrapped).toContain('printf');
    expect(wrapped).toContain('__STAGE_DONE_id2_');
  });

  it('produces PowerShell-compatible sentinel when isPowerShell is true', () => {
    const wrapped = wrapWithSentinel('id3', 'Get-Process', true);
    expect(wrapped).toContain('Write-Host');
    expect(wrapped).toContain('__STAGE_DONE_id3_');
    expect(wrapped).toContain('try {');
    expect(wrapped).not.toContain('printf');
    expect(wrapped.endsWith('\r')).toBe(true);
  });

  it('produces POSIX sentinel when isPowerShell is false', () => {
    const wrapped = wrapWithSentinel('id4', 'Get-Process', false);
    expect(wrapped).toContain('printf');
    expect(wrapped).not.toContain('Write-Host');
  });
});

// ─── PowerShell OSC 133 compatibility ─────────────────────────────

describe('OscParser — PowerShell BEL-encoded OSC 133', () => {
  let parser: OscParser;

  beforeEach(() => {
    parser = new OscParser();
  });

  it('parses BEL-terminated A/B/C/D cycle (PowerShell style)', () => {
    const done = vi.fn();
    parser.on('commandDone', done);

    // PowerShell emits BEL-terminated sequences just like the osc() helper
    parser.write('\x1b]133;A\x07');
    parser.write('PS> \x1b]133;B\x07');
    parser.write('\x1b]133;C\x07output from pwsh\x1b]133;D;0\x07');

    expect(done).toHaveBeenCalledOnce();
    const event: CommandDoneEvent = done.mock.calls[0][0];
    expect(event.output).toBe('output from pwsh');
    expect(event.exitCode).toBe(0);
  });

  it('detects shell integration from PowerShell OSC 133;A', () => {
    const spy = vi.fn();
    parser.on('integrationDetected', spy);

    parser.write('\x1b]133;A\x07');

    expect(spy).toHaveBeenCalledOnce();
    expect(parser.currentMode).toBe('osc');
  });

  it('extracts non-zero exit code from PowerShell D sequence', () => {
    const done = vi.fn();
    parser.on('commandDone', done);

    parser.write('\x1b]133;C\x07error\x1b]133;D;1\x07');

    const event: CommandDoneEvent = done.mock.calls[0][0];
    expect(event.exitCode).toBe(1);
  });
});
