/**
 * OSC 133 parser for PTY shell integration.
 *
 * Detects command boundaries via VS Code-style OSC 133 escape sequences:
 *   133;A — Prompt start
 *   133;B — Prompt end (user pressed enter, command about to run)
 *   133;C — Command output start
 *   133;D;{exitCode} — Command finished
 *
 * Falls back to sentinel-based detection when shell integration is absent.
 */

import { EventEmitter } from 'node:events';

// ─── OSC 133 regex ────────────────────────────────────────────────
// Matches both BEL (\x07) and ST (\x1b\\) terminators.
const OSC_133_RE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ESC/BEL control chars are the OSC 133 protocol
  /\x1b\]133;([ABCD])(?:;(-?\d+))?\x07|\x1b\]133;([ABCD])(?:;(-?\d+))?\x1b\\/g;

// ─── Sentinel format ──────────────────────────────────────────────
// __STAGE_DONE_<id>_<exitCode>__
const SENTINEL_RE = /__STAGE_DONE_([a-zA-Z0-9_-]+)_(-?\d+)__/;

// ─── Strip all OSC 133 sequences from text ────────────────────────
// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC/BEL control chars are the OSC 133 protocol
const OSC_133_STRIP_RE = /\x1b\]133;[ABCD](?:;-?\d+)?(?:\x07|\x1b\\)/g;

// ─── Types ────────────────────────────────────────────────────────

export type ParserMode = 'osc' | 'sentinel' | 'detecting';

export interface CommandDoneEvent {
  /** Command output (between 133;C and 133;D), OSC sequences stripped. */
  output: string;
  /** Exit code from 133;D;{code} or sentinel. `null` if not parseable. */
  exitCode: number | null;
}

export interface OscParserEvents {
  /** Prompt is being shown (133;A) */
  promptStart: [];
  /** User pressed enter — command about to run (133;B) */
  promptEnd: [];
  /** Command output has started (133;C) */
  commandStart: [];
  /** Command finished (133;D) */
  commandDone: [event: CommandDoneEvent];
  /** Raw output data that is not part of OSC sequences */
  output: [data: string];
  /** Sentinel detected — provides id and exit code */
  sentinelDone: [id: string, exitCode: number];
  /** Shell integration detected (first OSC 133 sequence seen) */
  integrationDetected: [];
}

/**
 * Typed EventEmitter for parser events.
 */
declare interface OscParserEmitter {
  on<K extends keyof OscParserEvents>(
    event: K,
    listener: (...args: OscParserEvents[K]) => void,
  ): this;
  once<K extends keyof OscParserEvents>(
    event: K,
    listener: (...args: OscParserEvents[K]) => void,
  ): this;
  emit<K extends keyof OscParserEvents>(
    event: K,
    ...args: OscParserEvents[K]
  ): boolean;
  removeAllListeners(event?: keyof OscParserEvents): this;
}

// ─── Parser ───────────────────────────────────────────────────────

export class OscParser extends (EventEmitter as new () => OscParserEmitter) {
  private mode: ParserMode = 'detecting';

  /** Buffer for partial escape sequences split across data chunks */
  private escBuffer = '';

  /** Buffer for partial sentinel markers split across data chunks */
  private sentinelBuffer = '';

  /** Accumulated output between 133;C and 133;D */
  private commandOutputBuf = '';
  private inCommandOutput = false;

  /** Whether at least one OSC 133 sequence has been seen */
  private oscDetected = false;

  get currentMode(): ParserMode {
    return this.mode;
  }

  /**
   * Force the parser into a specific mode.
   * Used when the SessionManager decides to switch to sentinel mode
   * after the detection grace period expires.
   */
  setMode(mode: ParserMode): void {
    this.mode = mode;
  }

  /**
   * Feed raw PTY data into the parser.
   * Call this from the PTY `onData` handler.
   */
  write(data: string): void {
    // Prepend any buffered partial escape sequence
    const input = this.escBuffer + data;
    this.escBuffer = '';

    // Check for a trailing partial ESC sequence that might be split
    // across chunks: buffer it for the next write.
    const lastEsc = input.lastIndexOf('\x1b');
    let processable: string;
    if (lastEsc >= 0 && lastEsc > input.length - 20) {
      // Could be a partial OSC sequence — the longest possible is
      // \x1b]133;D;-NNN\x1b\\ (~18 chars). Buffer from the ESC.
      const tail = input.slice(lastEsc);
      if (!this.isCompleteSequence(tail)) {
        processable = input.slice(0, lastEsc);
        this.escBuffer = tail;
      } else {
        processable = input;
      }
    } else {
      processable = input;
    }

    if (processable.length === 0) return;

    if (this.mode === 'osc' || this.mode === 'detecting') {
      this.processOsc(processable);
    }

    if (this.mode === 'sentinel') {
      // Emit raw output so command output is accumulated
      // by appendToCommandOutput even without OSC 133 framing.
      this.emit('output', processable);
      this.processSentinel(processable);
    }

    // In detecting mode, also check for sentinels
    if (this.mode === 'detecting') {
      this.processSentinel(processable);
    }
  }

  /**
   * Check if a string fragment contains a complete OSC 133 sequence
   * (i.e. it's not a truncated partial).
   */
  private isCompleteSequence(s: string): boolean {
    // Quick check: does it contain a BEL or ST terminator after ]133?
    if (s.includes('\x07')) return true;
    if (s.includes('\x1b\\') && s.indexOf('\x1b\\') > s.indexOf('\x1b]'))
      return true;
    return false;
  }

  private processOsc(data: string): void {
    let lastIndex = 0;
    OSC_133_RE.lastIndex = 0;

    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
    while ((match = OSC_133_RE.exec(data)) !== null) {
      const beforeMatch = data.slice(lastIndex, match.index);
      const marker = match[1] || match[3]; // A, B, C, or D
      const codeStr = match[2] || match[4]; // exit code for D

      // Emit non-sequence text as output
      if (beforeMatch.length > 0) {
        this.handleTextOutput(beforeMatch);
      }

      if (!this.oscDetected) {
        this.oscDetected = true;
        this.mode = 'osc';
        this.emit('integrationDetected');
      }

      switch (marker) {
        case 'A':
          this.emit('promptStart');
          break;
        case 'B':
          this.emit('promptEnd');
          break;
        case 'C':
          this.inCommandOutput = true;
          this.commandOutputBuf = '';
          this.emit('commandStart');
          break;
        case 'D': {
          const exitCode =
            codeStr != null ? Number.parseInt(codeStr, 10) : null;
          const output = this.commandOutputBuf;
          this.inCommandOutput = false;
          this.commandOutputBuf = '';
          this.emit('commandDone', {
            output: stripOsc133(output),
            exitCode:
              exitCode != null && !Number.isNaN(exitCode) ? exitCode : null,
          });
          break;
        }
      }

      lastIndex = match.index + match[0].length;
    }

    // Remaining text after last match
    const remaining = data.slice(lastIndex);
    if (remaining.length > 0) {
      this.handleTextOutput(remaining);
    }
  }

  private handleTextOutput(text: string): void {
    if (this.inCommandOutput) {
      this.commandOutputBuf += text;
    }
    this.emit('output', text);
  }

  private processSentinel(data: string): void {
    const combined = this.sentinelBuffer + data;
    this.sentinelBuffer = '';

    const match = SENTINEL_RE.exec(combined);
    if (match) {
      const id = match[1];
      const exitCode = Number.parseInt(match[2], 10);
      this.emit('sentinelDone', id, Number.isNaN(exitCode) ? 0 : exitCode);
      return;
    }

    // Buffer a trailing partial that could be the start of a sentinel.
    // The sentinel prefix is "__STAGE_DONE_" (14 chars). Keep up to
    // that many trailing characters for the next chunk.
    const markerPrefix = '__STAGE_DONE_';
    const idx = combined.lastIndexOf('_');
    if (idx >= 0) {
      const tail = combined.slice(Math.max(0, idx - markerPrefix.length));
      if (
        markerPrefix.startsWith(tail.slice(tail.lastIndexOf('__'))) ||
        tail.includes('__STAGE_DONE_')
      ) {
        this.sentinelBuffer = tail;
      }
    }
  }

  /**
   * Reset internal state. Call when reusing the parser for a new session.
   */
  reset(): void {
    this.escBuffer = '';
    this.sentinelBuffer = '';
    this.commandOutputBuf = '';
    this.inCommandOutput = false;
    this.removeAllListeners();
  }
}

// ─── Utilities ────────────────────────────────────────────────────

/**
 * Strip OSC 133 sequences from text.
 */
export function stripOsc133(text: string): string {
  return text.replace(OSC_133_STRIP_RE, '');
}

/**
 * Generate a sentinel command wrapper for use when shell integration
 * is not available.
 *
 * @param id - unique identifier for this command invocation
 * @param command - the original command to execute
 * @param isPowerShell - if true, emit PowerShell-compatible syntax
 * @returns the wrapped command string to write to the PTY
 */
export function wrapWithSentinel(
  id: string,
  command: string,
  isPowerShell?: boolean,
): string {
  if (isPowerShell) {
    // PowerShell: use try/catch and $LASTEXITCODE for the exit code
    return `try { ${command} } catch { }; Write-Host "__STAGE_DONE_${id}_$($LASTEXITCODE ?? 0)__"\r`;
  }
  // POSIX shells (bash, zsh, sh)
  return `eval ${shellEscape(command)}; printf '__STAGE_DONE_${id}_%d__\n' $?\r`;
}

/**
 * Simple shell escaping — wraps in single quotes with proper escaping.
 */
export function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
