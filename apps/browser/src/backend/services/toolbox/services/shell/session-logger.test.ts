import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionLogger } from './session-logger';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;

function makeTmpLogPath(name = 'test.shell.log'): string {
  return path.join(tmpDir, 'nested', 'dir', name);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-logger-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SessionLogger', () => {
  it('creates parent directories on construction', () => {
    const logPath = makeTmpLogPath();
    new SessionLogger(logPath);
    expect(fs.existsSync(path.dirname(logPath))).toBe(true);
  });

  it('append + flush writes data to the correct file', () => {
    const logPath = makeTmpLogPath();
    const logger = new SessionLogger(logPath);

    logger.append('hello world\n');
    logger.flush();

    expect(fs.readFileSync(logPath, 'utf-8')).toBe('hello world\n');
  });

  it('multiple appends accumulate before flush', () => {
    const logPath = makeTmpLogPath();
    const logger = new SessionLogger(logPath);

    logger.append('line 1\n');
    logger.append('line 2\n');
    logger.append('line 3\n');
    logger.flush();

    expect(fs.readFileSync(logPath, 'utf-8')).toBe('line 1\nline 2\nline 3\n');
  });

  it('debounced flush writes automatically', async () => {
    const logPath = makeTmpLogPath();
    const logger = new SessionLogger(logPath);

    logger.append('auto-flushed\n');

    // Data should not be on disk yet (buffered)
    expect(fs.existsSync(logPath)).toBe(false);

    // Wait for debounce (100ms) + margin
    await new Promise((r) => setTimeout(r, 200));

    expect(fs.readFileSync(logPath, 'utf-8')).toBe('auto-flushed\n');
    logger.close();
  });

  it('tracks lineCount correctly', () => {
    const logPath = makeTmpLogPath();
    const logger = new SessionLogger(logPath);

    expect(logger.lineCount).toBe(0);

    logger.append('no newline yet');
    expect(logger.lineCount).toBe(0);

    logger.append('\n');
    expect(logger.lineCount).toBe(1);

    logger.append('a\nb\nc\n');
    expect(logger.lineCount).toBe(4);

    logger.close();
  });

  it('enforces 50MB soft cap', () => {
    const logPath = makeTmpLogPath();
    const logger = new SessionLogger(logPath);

    // Write just under the cap
    const chunkSize = 10 * 1024 * 1024; // 10MB
    const chunk = 'x'.repeat(chunkSize);

    for (let i = 0; i < 5; i++) {
      logger.append(chunk);
    }
    // At this point, 50MB written — exactly at limit.
    // Next append should trigger truncation.
    logger.append('this should be rejected');
    logger.flush();

    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toContain('[log truncated: exceeded 50MB]');
    // The rejected data should NOT appear
    expect(content).not.toContain('this should be rejected');
  });

  it('close() flushes remaining buffer', () => {
    const logPath = makeTmpLogPath();
    const logger = new SessionLogger(logPath);

    logger.append('pending data\n');
    // Don't call flush — close should handle it
    logger.close();

    expect(fs.readFileSync(logPath, 'utf-8')).toBe('pending data\n');
  });

  it('append after close is a no-op', () => {
    const logPath = makeTmpLogPath();
    const logger = new SessionLogger(logPath);

    logger.append('before close\n');
    logger.close();

    logger.append('after close\n');
    logger.flush();

    expect(fs.readFileSync(logPath, 'utf-8')).toBe('before close\n');
  });

  it('successive flushes append to the file', () => {
    const logPath = makeTmpLogPath();
    const logger = new SessionLogger(logPath);

    logger.append('first\n');
    logger.flush();
    logger.append('second\n');
    logger.flush();

    expect(fs.readFileSync(logPath, 'utf-8')).toBe('first\nsecond\n');
    logger.close();
  });

  it('flush with empty buffer is a no-op', () => {
    const logPath = makeTmpLogPath();
    const logger = new SessionLogger(logPath);

    logger.flush();
    // File should not be created for empty flush
    expect(fs.existsSync(logPath)).toBe(false);
    logger.close();
  });
});

describe('SessionLogger.getRawSinceCursor', () => {
  it('returns empty data when cursor matches the current total', () => {
    const logger = new SessionLogger(makeTmpLogPath());
    logger.appendRaw(Buffer.from('hello'));

    const total = logger.getTotalRawBytes();
    const result = logger.getRawSinceCursor(total);

    expect(result.data.length).toBe(0);
    expect(result.cursor).toBe(total);
    expect(result.truncated).toBe(false);
    logger.close();
  });

  it('returns empty data when cursor is ahead of total (e.g. stale)', () => {
    const logger = new SessionLogger(makeTmpLogPath());
    logger.appendRaw(Buffer.from('hi'));

    const result = logger.getRawSinceCursor(9999);

    expect(result.data.length).toBe(0);
    expect(result.cursor).toBe(logger.getTotalRawBytes());
    expect(result.truncated).toBe(false);
    logger.close();
  });

  it('cursor=0 returns the full retained buffer (no truncation flag)', () => {
    const logger = new SessionLogger(makeTmpLogPath());
    logger.appendRaw(Buffer.from('one'));
    logger.appendRaw(Buffer.from('two'));

    const result = logger.getRawSinceCursor(0);

    expect(result.data.toString('utf-8')).toBe('onetwo');
    expect(result.cursor).toBe(6);
    expect(result.truncated).toBe(false);
    logger.close();
  });

  it('returns only bytes appended since cursor (mid-stream slice)', () => {
    const logger = new SessionLogger(makeTmpLogPath());
    logger.appendRaw(Buffer.from('aaa'));
    const cursor = logger.getTotalRawBytes();
    logger.appendRaw(Buffer.from('bbb'));
    logger.appendRaw(Buffer.from('ccc'));

    const result = logger.getRawSinceCursor(cursor);

    expect(result.data.toString('utf-8')).toBe('bbbccc');
    expect(result.cursor).toBe(9);
    expect(result.truncated).toBe(false);
    logger.close();
  });

  it('handles cursors that fall in the middle of a chunk', () => {
    const logger = new SessionLogger(makeTmpLogPath());
    logger.appendRaw(Buffer.from('helloworld')); // single 10-byte chunk

    // Cursor lands inside the chunk — implementation must subarray it.
    const result = logger.getRawSinceCursor(5);

    expect(result.data.toString('utf-8')).toBe('world');
    expect(result.cursor).toBe(10);
    expect(result.truncated).toBe(false);
    logger.close();
  });

  it('skips entirely-consumed chunks before slicing', () => {
    const logger = new SessionLogger(makeTmpLogPath());
    logger.appendRaw(Buffer.from('AAA')); // 0..3
    logger.appendRaw(Buffer.from('BBB')); // 3..6
    logger.appendRaw(Buffer.from('CCC')); // 6..9

    // Cursor=4 → mid-chunk in BBB, should yield "BB" + "CCC"
    const result = logger.getRawSinceCursor(4);

    expect(result.data.toString('utf-8')).toBe('BBCCC');
    expect(result.cursor).toBe(9);
    expect(result.truncated).toBe(false);
    logger.close();
  });

  it('flags truncated when cursor predates the retained ring buffer', () => {
    const logger = new SessionLogger(makeTmpLogPath());
    // Force ring eviction by writing past 100 KiB cap.
    const filler = Buffer.alloc(50 * 1024, 0x41); // 50 KiB of 'A'
    logger.appendRaw(filler);
    logger.appendRaw(filler);
    logger.appendRaw(filler); // now 150 KiB written, ring trims oldest

    const total = logger.getTotalRawBytes();
    expect(total).toBe(150 * 1024);

    // Stale cursor of 1 byte should be reported as truncated.
    const result = logger.getRawSinceCursor(1);

    expect(result.truncated).toBe(true);
    expect(result.cursor).toBe(total);
    // Returned data is the retained ring buffer (after eviction).
    expect(result.data.length).toBeLessThanOrEqual(150 * 1024);
    expect(result.data.length).toBeGreaterThan(0);
    logger.close();
  });

  it('getTotalRawBytes is monotonic across eviction', () => {
    const logger = new SessionLogger(makeTmpLogPath());
    const filler = Buffer.alloc(60 * 1024, 0x42);

    logger.appendRaw(filler);
    expect(logger.getTotalRawBytes()).toBe(60 * 1024);

    logger.appendRaw(filler);
    // Past the 100 KiB cap — eviction has happened, but total never resets.
    expect(logger.getTotalRawBytes()).toBe(120 * 1024);
    logger.close();
  });
});
