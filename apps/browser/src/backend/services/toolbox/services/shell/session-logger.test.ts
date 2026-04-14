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
