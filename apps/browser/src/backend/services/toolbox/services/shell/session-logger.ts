import {
  mkdirSync,
  appendFileSync,
  statSync,
  openSync,
  readSync,
  closeSync,
} from 'node:fs';
import path from 'node:path';
import xtermHeadless from '@xterm/headless';
import { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS } from './types';
const { Terminal } = xtermHeadless;

/** Debounce interval (ms) for flushing buffered output to disk. */
const FLUSH_DEBOUNCE_MS = 100;

/** Soft cap (bytes) per log file. Writing stops after this threshold. */
const MAX_LOG_BYTES = 50 * 1024 * 1024;

/** Maximum bytes retained in the in-memory raw PTY circular buffer (for future xterm replay). */
const MAX_RAW_BUFFER_BYTES = 100 * 1024;

/**
 * Append-only logger for a single PTY session.
 *
 * Buffers incoming text and flushes to disk on a debounce timer.
 * Tracks cumulative line count for downstream diffing (PR3).
 */
export class SessionLogger {
  readonly filePath: string;

  private _lineCount = 0;
  private _writtenBytes = 0;
  private _truncated = false;
  private _closed = false;
  private _buffer = '';
  private _flushTimer: NodeJS.Timeout | null = null;

  // Raw circular buffer for future xterm replay (unstripped PTY bytes).
  private _rawChunks: Buffer[] = [];
  private _rawBytes = 0;

  // Headless terminal emulator for accurate screen-state reads.
  private _terminal: InstanceType<typeof Terminal>;
  /** Cached last line, populated on close() so reads remain safe after dispose. */
  private _cachedLastLine: string | null = null;

  constructor(
    filePath: string,
    cols = DEFAULT_TERMINAL_COLS,
    rows = DEFAULT_TERMINAL_ROWS,
  ) {
    this.filePath = filePath;
    mkdirSync(path.dirname(filePath), { recursive: true });
    this._terminal = new Terminal({
      cols,
      rows,
      scrollback: 5000,
      allowProposedApi: true,
    });
  }

  get lineCount(): number {
    return this._lineCount;
  }

  /**
   * Append stripped PTY output to the internal buffer.
   * Schedules a debounced flush to disk.
   */
  append(data: string): void {
    if (this._closed || this._truncated) return;

    const byteLen = Buffer.byteLength(data, 'utf-8');

    if (this._writtenBytes + byteLen > MAX_LOG_BYTES) {
      this._truncated = true;
      this._buffer += '\n[log truncated: exceeded 50MB]\n';
      this.flush();
      return;
    }

    this._writtenBytes += byteLen;
    this._buffer += data;

    // Count newlines
    let idx = data.indexOf('\n');
    while (idx !== -1) {
      this._lineCount++;
      idx = data.indexOf('\n', idx + 1);
    }

    this.scheduleFlush();
  }

  /** Immediately write buffered data to disk and clear the timer. */
  flush(): void {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    if (this._buffer.length === 0) return;

    try {
      appendFileSync(this.filePath, this._buffer);
      this._buffer = '';
    } catch {
      // Disk full, path invalid, or other I/O failure — stop writing.
      this._closed = true;
      this._buffer = '';
    }
  }

  /**
   * Returns the last `maxChars` characters of the log file.
   * Flushes the buffer first to ensure all data is on disk.
   */
  getTail(maxChars: number): string {
    this.flush();
    try {
      const stat = statSync(this.filePath);
      if (stat.size === 0) return '';
      const start = Math.max(0, stat.size - maxChars * 4); // over-read for multi-byte safety
      const fd = openSync(this.filePath, 'r');
      try {
        const buf = Buffer.alloc(stat.size - start);
        readSync(fd, buf, 0, buf.length, start);
        const text = buf.toString('utf-8');
        if (text.length <= maxChars) return text;
        return text.slice(-maxChars);
      } finally {
        closeSync(fd);
      }
    } catch {
      return '';
    }
  }

  /**
   * Append raw (unstripped) PTY bytes to the in-memory circular buffer.
   * Oldest chunks are evicted when the total exceeds MAX_RAW_BUFFER_BYTES.
   */
  appendRaw(data: Buffer): void {
    // MUST use writeSync so the terminal buffer is immediately up-to-date
    // when the OscParser fires synchronous resolution events that read it
    // via serializeFrom(). The async write() queues data internally and
    // the buffer would still be stale at resolution time.
    (this._terminal as any)._core.writeSync(data);
    this._rawChunks.push(data);
    this._rawBytes += data.byteLength;
    // Evict oldest chunks until we are within the cap.
    while (
      this._rawBytes > MAX_RAW_BUFFER_BYTES &&
      this._rawChunks.length > 0
    ) {
      this._rawBytes -= this._rawChunks[0]!.byteLength;
      this._rawChunks.shift();
    }
  }

  /**
   * Returns a single concatenated Buffer containing all retained raw PTY bytes.
   * This is the replay source for a future xterm renderer.
   */
  getRawBuffer(): Buffer {
    return Buffer.concat(this._rawChunks);
  }

  /**
   * Returns the last non-empty line visible in the headless terminal buffer.
   * This is always accurate because the terminal maintains proper 2D grid state.
   */
  getLastLine(): string {
    if (this._cachedLastLine !== null) return this._cachedLastLine;
    const buf = this._terminal.buffer.active;
    for (let y = buf.cursorY; y >= 0; y--) {
      const line = buf.getLine(y)?.translateToString(true).trimEnd();
      if (line && line.length > 0) return line;
    }
    return '';
  }

  // ─── Buffer serialization ──────────────────────────────────────

  /** Resize the headless terminal to match the frontend/PTY dimensions. */
  resize(cols: number, rows: number): void {
    this._terminal.resize(cols, rows);
  }

  /** Expose the headless terminal for mark-position reads. */
  get terminal(): InstanceType<typeof Terminal> {
    return this._terminal;
  }

  /**
   * Returns the current absolute cursor position in the normal buffer.
   * Used to record a "mark" before a command is written to the PTY.
   */
  getMarkPosition(): number {
    const buf = this._terminal.buffer.normal;
    return buf.baseY + buf.cursorY;
  }

  /** Whether the terminal is currently showing the alternate buffer (TUI mode). */
  isAlternateBufferActive(): boolean {
    return this._terminal.buffer.active.type === 'alternate';
  }

  /**
   * Serialize terminal buffer lines from `markLine` to the current cursor.
   * Returns an array of logical lines (wrapped rows joined) with trailing
   * whitespace trimmed per line.
   */
  serializeFrom(markLine: number): string[] {
    const buf = this._terminal.buffer.normal;
    const cursorLine = buf.baseY + buf.cursorY;

    // When interactive CLIs (e.g. prompts library) collapse multi-line
    // selection menus, the cursor can rewind above the mark. In that case
    // swap the range so we still capture the rewritten region.
    let startY: number;
    let endY: number;

    if (cursorLine < markLine) {
      startY = cursorLine;
      endY = markLine;
    } else {
      startY = markLine;
      endY = cursorLine;
    }

    // Eviction fallback: if the start has scrolled out of the buffer, start at 0
    if (buf.getLine(startY) === undefined) startY = 0;

    // Walk backward if the start lands on a wrapped continuation
    while (startY > 0 && buf.getLine(startY)?.isWrapped) startY--;

    return this.readLines(buf, startY, endY);
  }

  /**
   * Serialize up to `maxRows` rows ending at the current cursor, starting
   * no earlier than `markLine`. Used by the live UI streaming path where
   * we only need a tailing window, not the full command scrollback.
   *
   * Handles mark eviction, cursor rewinds (interactive prompts), and
   * wrapped-line continuations the same way as `serializeFrom`.
   */
  serializeTailFrom(markLine: number, maxRows: number): string[] {
    const buf = this._terminal.buffer.normal;
    const cursorLine = buf.baseY + buf.cursorY;

    // The cursor is always the newest write position — even when an
    // interactive prompt (e.g. a collapsing multi-line selector) rewinds
    // it above the command's original mark. The cap must therefore trail
    // the cursor, not the mark, so live snapshots never drop the current
    // cursor row.
    const endY = cursorLine;
    let startY = Math.min(cursorLine, markLine);

    // Cap the window to `maxRows` rows trailing `endY`.
    startY = Math.max(startY, endY - maxRows + 1);

    // Eviction fallback: if the capped start has scrolled out, clamp to 0.
    if (buf.getLine(startY) === undefined) startY = 0;

    // Walk backward if the start lands on a wrapped continuation.
    while (startY > 0 && buf.getLine(startY)?.isWrapped) startY--;

    return this.readLines(buf, startY, endY);
  }

  /**
   * Serialize the current alternate buffer viewport.
   * Used when a TUI (vim, htop, less) is active at resolution time.
   */
  serializeAlternate(): string[] {
    const buf = this._terminal.buffer.active;
    if (buf.type !== 'alternate') return [];
    return this.readLines(buf, 0, this._terminal.rows - 1);
  }

  /**
   * Read logical lines from a buffer range, joining wrapped rows.
   */
  private readLines(
    buf: InstanceType<typeof Terminal>['buffer']['normal'],
    startY: number,
    endY: number,
  ): string[] {
    const lines: string[] = [];
    for (let y = startY; y <= endY; y++) {
      const row = buf.getLine(y);
      if (!row) continue;
      const text = row.translateToString(true);
      if (row.isWrapped && lines.length > 0) lines[lines.length - 1] += text;
      else lines.push(text);
    }
    return lines;
  }

  /** Flush remaining data and mark the logger as closed. */
  close(): void {
    if (this._closed) return;
    this._closed = true;
    this._cachedLastLine = this.getLastLine();
    this.flush();
    this._terminal.dispose();
  }

  private scheduleFlush(): void {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }
}
