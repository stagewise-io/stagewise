import { mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';

/** Debounce interval (ms) for flushing buffered output to disk. */
const FLUSH_DEBOUNCE_MS = 100;

/** Soft cap (bytes) per log file. Writing stops after this threshold. */
const MAX_LOG_BYTES = 50 * 1024 * 1024;

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

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(path.dirname(filePath), { recursive: true });
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

  /** Flush remaining data and mark the logger as closed. */
  close(): void {
    if (this._closed) return;
    this._closed = true;
    this.flush();
  }

  private scheduleFlush(): void {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }
}
