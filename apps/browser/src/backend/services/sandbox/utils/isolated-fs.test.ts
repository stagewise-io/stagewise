import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createIsolatedFs } from './isolated-fs';
import {
  type MountDescriptor,
  type MountPermission,
  FULL_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
  APPEND_ONLY_PERMISSIONS,
} from '../ipc';

let tmpRoot: string;
let mountA: string;
let mountB: string;

function mount(
  prefix: string,
  absolutePath: string,
  permissions: MountPermission[] = FULL_PERMISSIONS,
): MountDescriptor {
  return { prefix, absolutePath, permissions };
}

beforeEach(async () => {
  const raw = await fsp.mkdtemp(path.join(os.tmpdir(), 'isolated-fs-test-'));
  // Resolve symlinks (macOS /var → /private/var) so paths match realpathSync
  tmpRoot = fs.realpathSync(raw);
  mountA = path.join(tmpRoot, 'workspace-a');
  mountB = path.join(tmpRoot, 'workspace-b');
  await fsp.mkdir(mountA, { recursive: true });
  await fsp.mkdir(mountB, { recursive: true });
});

afterEach(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

// =============================================================================
// Path Resolution
// =============================================================================

describe('path resolution', () => {
  it('resolves prefixed path with single mount', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'hello.txt'), 'world');
    const content = isolatedFs.readFileSync('w1/hello.txt', 'utf-8');
    expect(content).toBe('world');
  });

  it('resolves unprefixed path when only one mount exists', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'hello.txt'), 'world');
    const content = isolatedFs.readFileSync('hello.txt', 'utf-8');
    expect(content).toBe('world');
  });

  it('routes to correct mount with multiple mounts', () => {
    const mounts = [mount('wa', mountA), mount('wb', mountB)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'a.txt'), 'from A');
    fs.writeFileSync(path.join(mountB, 'b.txt'), 'from B');

    expect(isolatedFs.readFileSync('wa/a.txt', 'utf-8')).toBe('from A');
    expect(isolatedFs.readFileSync('wb/b.txt', 'utf-8')).toBe('from B');
  });

  it('throws when unprefixed path is used with multiple mounts', () => {
    const mounts = [mount('wa', mountA), mount('wb', mountB)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'a.txt'), 'from A');
    expect(() => isolatedFs.readFileSync('a.txt', 'utf-8')).toThrow(
      /must be prefixed with a mount/,
    );
  });

  it('throws when no mounts are configured', () => {
    const { isolatedFs } = createIsolatedFs([], null);

    expect(() => isolatedFs.readFileSync('anything', 'utf-8')).toThrow(
      /No workspaces mounted/,
    );
  });

  it('resolves nested directories correctly', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.mkdirSync(path.join(mountA, 'src', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(mountA, 'src', 'lib', 'util.ts'), 'export {}');

    const content = isolatedFs.readFileSync('w1/src/lib/util.ts', 'utf-8');
    expect(content).toBe('export {}');
  });

  it('handles backslash separators (Windows-style paths)', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.mkdirSync(path.join(mountA, 'src'), { recursive: true });
    fs.writeFileSync(path.join(mountA, 'src', 'index.ts'), 'hello');

    const content = isolatedFs.readFileSync('w1\\src\\index.ts', 'utf-8');
    expect(content).toBe('hello');
  });
});

// =============================================================================
// Security — Path Traversal Prevention
// =============================================================================

describe('security', () => {
  it('blocks path traversal via ../', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    const secretPath = path.join(tmpRoot, 'secret.txt');
    fs.writeFileSync(secretPath, 'password');

    expect(() =>
      isolatedFs.readFileSync('w1/../secret.txt', 'utf-8'),
    ).toThrow();
  });

  it('blocks deeply nested traversal', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    expect(() =>
      isolatedFs.readFileSync('w1/a/b/../../../../etc/passwd', 'utf-8'),
    ).toThrow();
  });

  // Windows requires admin privileges to create symlinks
  it.skipIf(process.platform === 'win32')('blocks symlink escape', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    const secretPath = path.join(tmpRoot, 'secret.txt');
    fs.writeFileSync(secretPath, 'password');
    fs.symlinkSync(secretPath, path.join(mountA, 'sneaky-link'));

    expect(() => isolatedFs.readFileSync('w1/sneaky-link', 'utf-8')).toThrow(
      /escapes/,
    );
  });

  it('normalises absolute-looking paths within the mount', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'file.txt'), 'ok');
    const content = isolatedFs.readFileSync('w1/./file.txt', 'utf-8');
    expect(content).toBe('ok');
  });
});

// =============================================================================
// Sync Wrappers — Single-Path Functions
// =============================================================================

describe('sync wrappers', () => {
  it('readFileSync reads from mount', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'data.txt'), 'hello');
    expect(isolatedFs.readFileSync('w1/data.txt', 'utf-8')).toBe('hello');
  });

  it('writeFileSync writes into mount', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    isolatedFs.writeFileSync('w1/out.txt', 'written', 'utf-8');
    expect(fs.readFileSync(path.join(mountA, 'out.txt'), 'utf-8')).toBe(
      'written',
    );
  });

  it('existsSync detects existing file', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'exists.txt'), '');
    expect(isolatedFs.existsSync('w1/exists.txt')).toBe(true);
    expect(isolatedFs.existsSync('w1/nope.txt')).toBe(false);
  });

  it('mkdirSync creates directories', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    isolatedFs.mkdirSync('w1/new-dir', { recursive: true });
    expect(fs.statSync(path.join(mountA, 'new-dir')).isDirectory()).toBe(true);
  });

  it('readdirSync lists mount contents', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'a.txt'), '');
    fs.writeFileSync(path.join(mountA, 'b.txt'), '');

    const entries = isolatedFs.readdirSync('w1');
    expect(entries).toContain('a.txt');
    expect(entries).toContain('b.txt');
  });

  it('statSync returns file stats', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'stat-me.txt'), 'content');
    const stats = isolatedFs.statSync('w1/stat-me.txt');
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBe(7);
  });

  it('unlinkSync removes file', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'delete-me.txt'), 'bye');
    isolatedFs.unlinkSync('w1/delete-me.txt');
    expect(fs.existsSync(path.join(mountA, 'delete-me.txt'))).toBe(false);
  });

  it('appendFileSync appends to file', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'log.txt'), 'line1\n');
    isolatedFs.appendFileSync('w1/log.txt', 'line2\n');
    expect(fs.readFileSync(path.join(mountA, 'log.txt'), 'utf-8')).toBe(
      'line1\nline2\n',
    );
  });

  it('chmodSync changes permissions', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'perm.txt'), '');
    isolatedFs.chmodSync('w1/perm.txt', 0o444);
    const stats = fs.statSync(path.join(mountA, 'perm.txt'));
    expect(stats.mode & 0o777).toBe(0o444);
    // Restore write so afterEach cleanup works
    fs.chmodSync(path.join(mountA, 'perm.txt'), 0o644);
  });
});

// =============================================================================
// Sync Wrappers — Two-Path Functions
// =============================================================================

describe('two-path sync wrappers', () => {
  it('copyFileSync copies between mounted paths', () => {
    const mounts = [mount('wa', mountA), mount('wb', mountB)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'src.txt'), 'copied');
    isolatedFs.copyFileSync('wa/src.txt', 'wb/dst.txt');
    expect(fs.readFileSync(path.join(mountB, 'dst.txt'), 'utf-8')).toBe(
      'copied',
    );
  });

  it('renameSync moves file between directories in same mount', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.mkdirSync(path.join(mountA, 'dir'));
    fs.writeFileSync(path.join(mountA, 'move-me.txt'), 'content');
    isolatedFs.renameSync('w1/move-me.txt', 'w1/dir/moved.txt');

    expect(fs.existsSync(path.join(mountA, 'move-me.txt'))).toBe(false);
    expect(
      fs.readFileSync(path.join(mountA, 'dir', 'moved.txt'), 'utf-8'),
    ).toBe('content');
  });
});

// =============================================================================
// Async (Promises) Wrappers
// =============================================================================

describe('async (promises) wrappers', () => {
  it('readFile reads from mount', async () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, null);

    await fsp.writeFile(path.join(mountA, 'async.txt'), 'async-content');
    const content = await isolatedFsPromises.readFile('w1/async.txt', 'utf-8');
    expect(content).toBe('async-content');
  });

  it('writeFile writes into mount', async () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, null);

    await isolatedFsPromises.writeFile('w1/written.txt', 'hello-async');
    const content = await fsp.readFile(
      path.join(mountA, 'written.txt'),
      'utf-8',
    );
    expect(content).toBe('hello-async');
  });

  it('mkdir creates directories', async () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, null);

    await isolatedFsPromises.mkdir('w1/async-dir', { recursive: true });
    const stats = await fsp.stat(path.join(mountA, 'async-dir'));
    expect(stats.isDirectory()).toBe(true);
  });

  it('readdir lists contents', async () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, null);

    await fsp.writeFile(path.join(mountA, 'x.txt'), '');
    await fsp.writeFile(path.join(mountA, 'y.txt'), '');

    const entries = await isolatedFsPromises.readdir('w1');
    expect(entries).toContain('x.txt');
    expect(entries).toContain('y.txt');
  });

  it('unlink removes file', async () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, null);

    await fsp.writeFile(path.join(mountA, 'gone.txt'), 'bye');
    await isolatedFsPromises.unlink('w1/gone.txt');
    await expect(fsp.access(path.join(mountA, 'gone.txt'))).rejects.toThrow();
  });

  it('copyFile copies between mounts', async () => {
    const mounts = [mount('wa', mountA), mount('wb', mountB)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, null);

    await fsp.writeFile(path.join(mountA, 'orig.txt'), 'data');
    await isolatedFsPromises.copyFile('wa/orig.txt', 'wb/copy.txt');
    const content = await fsp.readFile(path.join(mountB, 'copy.txt'), 'utf-8');
    expect(content).toBe('data');
  });

  it('stat returns file info', async () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, null);

    await fsp.writeFile(path.join(mountA, 'info.txt'), '12345');
    const stats = await isolatedFsPromises.stat('w1/info.txt');
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBe(5);
  });
});

// =============================================================================
// File Descriptor Passthrough
// =============================================================================

describe('file descriptor passthrough', () => {
  it('readFileSync passes through numeric fd', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    const filePath = path.join(mountA, 'fd-test.txt');
    fs.writeFileSync(filePath, 'fd-content');
    const fd = fs.openSync(filePath, 'r');
    try {
      const content = isolatedFs.readFileSync(fd, 'utf-8');
      expect(content).toBe('fd-content');
    } finally {
      fs.closeSync(fd);
    }
  });

  it('writeFileSync passes through numeric fd', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    const filePath = path.join(mountA, 'fd-write.txt');
    const fd = fs.openSync(filePath, 'w');
    try {
      isolatedFs.writeFileSync(fd, 'written-via-fd');
    } finally {
      fs.closeSync(fd);
    }
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('written-via-fd');
  });
});

// =============================================================================
// Diff Notification — Sync
// =============================================================================

describe('diff notifications (sync)', () => {
  it('writeFileSync triggers notification with before/after', () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, notifyDiff);

    fs.writeFileSync(path.join(mountA, 'diff.txt'), 'before');
    isolatedFs.writeFileSync('w1/diff.txt', 'after', 'utf-8');

    expect(notifyDiff).toHaveBeenCalledTimes(1);
    const [absPath, before, after, isExternal, bytesWritten] =
      notifyDiff.mock.calls[0];
    expect(absPath).toBe(path.join(mountA, 'diff.txt'));
    expect(before).toBe('before');
    expect(after).toBe('after');
    expect(isExternal).toBe(false);
    expect(bytesWritten).toBe(5);
  });

  it('writeFileSync for new file has null before', () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, notifyDiff);

    isolatedFs.writeFileSync('w1/brand-new.txt', 'hello', 'utf-8');

    expect(notifyDiff).toHaveBeenCalledTimes(1);
    const [, before, after] = notifyDiff.mock.calls[0];
    expect(before).toBeNull();
    expect(after).toBe('hello');
  });

  it('unlinkSync triggers notification with null after', () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, notifyDiff);

    fs.writeFileSync(path.join(mountA, 'rm-me.txt'), 'doomed');
    isolatedFs.unlinkSync('w1/rm-me.txt');

    expect(notifyDiff).toHaveBeenCalledTimes(1);
    const [, before, after] = notifyDiff.mock.calls[0];
    expect(before).toBe('doomed');
    expect(after).toBeNull();
  });

  it('appendFileSync triggers notification', () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, notifyDiff);

    fs.writeFileSync(path.join(mountA, 'append.txt'), 'A');
    isolatedFs.appendFileSync('w1/append.txt', 'B');

    expect(notifyDiff).toHaveBeenCalledTimes(1);
    const [, before, after] = notifyDiff.mock.calls[0];
    expect(before).toBe('A');
    expect(after).toBe('AB');
  });

  it('readFileSync does NOT trigger notification', () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, notifyDiff);

    fs.writeFileSync(path.join(mountA, 'readonly.txt'), 'read-only');
    isolatedFs.readFileSync('w1/readonly.txt', 'utf-8');

    expect(notifyDiff).not.toHaveBeenCalled();
  });

  it('readdirSync does NOT trigger notification', () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, notifyDiff);

    isolatedFs.readdirSync('w1');
    expect(notifyDiff).not.toHaveBeenCalled();
  });

  it('statSync does NOT trigger notification', () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, notifyDiff);

    fs.writeFileSync(path.join(mountA, 'stat.txt'), '');
    isolatedFs.statSync('w1/stat.txt');
    expect(notifyDiff).not.toHaveBeenCalled();
  });

  it('copyFileSync triggers notification for destination', () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, notifyDiff);

    fs.writeFileSync(path.join(mountA, 'cp-src.txt'), 'data');
    isolatedFs.copyFileSync('w1/cp-src.txt', 'w1/cp-dst.txt');

    // source unchanged → only dst notification
    expect(notifyDiff).toHaveBeenCalledTimes(1);
    const [absPath, before, after] = notifyDiff.mock.calls[0];
    expect(absPath).toBe(path.join(mountA, 'cp-dst.txt'));
    expect(before).toBeNull();
    expect(after).toBe('data');
  });

  it('renameSync triggers notification for both source and destination', () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, notifyDiff);

    fs.writeFileSync(path.join(mountA, 'old-name.txt'), 'moved');
    isolatedFs.renameSync('w1/old-name.txt', 'w1/new-name.txt');

    // source changed (deleted) + destination notification
    expect(notifyDiff).toHaveBeenCalledTimes(2);

    const srcCall = notifyDiff.mock.calls[0];
    expect(srcCall[0]).toBe(path.join(mountA, 'old-name.txt'));
    expect(srcCall[1]).toBe('moved');
    expect(srcCall[2]).toBeNull();

    const dstCall = notifyDiff.mock.calls[1];
    expect(dstCall[0]).toBe(path.join(mountA, 'new-name.txt'));
    expect(dstCall[1]).toBeNull();
    expect(dstCall[2]).toBe('moved');
  });

  it('mkdirSync triggers notification', () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, notifyDiff);

    isolatedFs.mkdirSync('w1/new-dir');
    expect(notifyDiff).toHaveBeenCalledTimes(1);
  });

  it('handles null notifyDiff gracefully (no crash)', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    isolatedFs.writeFileSync('w1/no-notify.txt', 'ok', 'utf-8');
    expect(fs.readFileSync(path.join(mountA, 'no-notify.txt'), 'utf-8')).toBe(
      'ok',
    );
  });

  it('marks binary files as external in diff notification', () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, notifyDiff);

    const binaryContent = Buffer.alloc(100);
    binaryContent[50] = 0; // null byte → binary
    isolatedFs.writeFileSync('w1/binary.bin', binaryContent);

    expect(notifyDiff).toHaveBeenCalledTimes(1);
    const [, before, after, isExternal] = notifyDiff.mock.calls[0];
    expect(before).toBeNull();
    expect(after).toBeNull();
    expect(isExternal).toBe(true);
  });
});

// =============================================================================
// Diff Notification — Async (Promises)
// =============================================================================

describe('diff notifications (async)', () => {
  it('writeFile triggers notification with before/after', async () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, notifyDiff);

    await fsp.writeFile(path.join(mountA, 'async-diff.txt'), 'old');
    await isolatedFsPromises.writeFile('w1/async-diff.txt', 'new');

    expect(notifyDiff).toHaveBeenCalledTimes(1);
    const [absPath, before, after, isExternal] = notifyDiff.mock.calls[0];
    expect(absPath).toBe(path.join(mountA, 'async-diff.txt'));
    expect(before).toBe('old');
    expect(after).toBe('new');
    expect(isExternal).toBe(false);
  });

  it('readFile does NOT trigger notification', async () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, notifyDiff);

    await fsp.writeFile(path.join(mountA, 'read-only.txt'), 'safe');
    await isolatedFsPromises.readFile('w1/read-only.txt', 'utf-8');
    expect(notifyDiff).not.toHaveBeenCalled();
  });

  it('unlink triggers notification with null after', async () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, notifyDiff);

    await fsp.writeFile(path.join(mountA, 'async-rm.txt'), 'gone');
    await isolatedFsPromises.unlink('w1/async-rm.txt');

    expect(notifyDiff).toHaveBeenCalledTimes(1);
    const [, before, after] = notifyDiff.mock.calls[0];
    expect(before).toBe('gone');
    expect(after).toBeNull();
  });

  it('copyFile triggers notification for destination', async () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('wa', mountA), mount('wb', mountB)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, notifyDiff);

    await fsp.writeFile(path.join(mountA, 'src.txt'), 'payload');
    await isolatedFsPromises.copyFile('wa/src.txt', 'wb/dst.txt');

    // source unchanged → only dst notification
    expect(notifyDiff).toHaveBeenCalledTimes(1);
    const [absPath, before, after] = notifyDiff.mock.calls[0];
    expect(absPath).toBe(path.join(mountB, 'dst.txt'));
    expect(before).toBeNull();
    expect(after).toBe('payload');
  });

  it('rename triggers notifications for source and destination', async () => {
    const notifyDiff = vi.fn();
    const mounts = [mount('w1', mountA)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, notifyDiff);

    await fsp.writeFile(path.join(mountA, 'async-old.txt'), 'content');
    await isolatedFsPromises.rename('w1/async-old.txt', 'w1/async-new.txt');

    expect(notifyDiff).toHaveBeenCalledTimes(2);

    const srcCall = notifyDiff.mock.calls[0];
    expect(srcCall[1]).toBe('content');
    expect(srcCall[2]).toBeNull();

    const dstCall = notifyDiff.mock.calls[1];
    expect(dstCall[1]).toBeNull();
    expect(dstCall[2]).toBe('content');
  });
});

// =============================================================================
// Stream & Non-Sync Functions
// =============================================================================

describe('stream wrappers', () => {
  it('createReadStream reads from mounted path', async () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'stream.txt'), 'stream-data');
    const stream = isolatedFs.createReadStream('w1/stream.txt', 'utf-8');

    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as string);
    }
    expect(chunks.join('')).toBe('stream-data');
  });

  it('createWriteStream writes to mounted path', async () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    const stream = isolatedFs.createWriteStream('w1/ws-out.txt');
    await new Promise<void>((resolve, reject) => {
      stream.write('stream-write', (err: Error | null | undefined) => {
        if (err) reject(err);
        stream.end(resolve);
      });
    });

    expect(fs.readFileSync(path.join(mountA, 'ws-out.txt'), 'utf-8')).toBe(
      'stream-write',
    );
  });
});

// =============================================================================
// Realpath
// =============================================================================

describe('realpath wrappers', () => {
  it('realpathSync resolves within mount', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'real.txt'), '');
    const resolved = isolatedFs.realpathSync('w1/real.txt');
    expect(resolved).toBe(fs.realpathSync(path.join(mountA, 'real.txt')));
  });

  it('promises realpath resolves within mount', async () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, null);

    await fsp.writeFile(path.join(mountA, 'real-async.txt'), '');
    const resolved = await isolatedFsPromises.realpath('w1/real-async.txt');
    expect(resolved).toBe(
      await fsp.realpath(path.join(mountA, 'real-async.txt')),
    );
  });
});

// =============================================================================
// Factory Output Shape
// =============================================================================

describe('createIsolatedFs output shape', () => {
  it('returns isolatedFs and isolatedFsPromises', () => {
    const result = createIsolatedFs([mount('w1', mountA)], null);
    expect(result).toHaveProperty('isolatedFs');
    expect(result).toHaveProperty('isolatedFsPromises');
  });

  it('isolatedFs has promises property', () => {
    const { isolatedFs } = createIsolatedFs([mount('w1', mountA)], null);
    expect(isolatedFs.promises).toBeDefined();
    expect(typeof isolatedFs.promises.readFile).toBe('function');
  });

  it('isolatedFs has constants property', () => {
    const { isolatedFs } = createIsolatedFs([mount('w1', mountA)], null);
    expect(isolatedFs.constants).toBe(fs.constants);
  });

  it('wraps all expected single-path functions', () => {
    const { isolatedFs } = createIsolatedFs([mount('w1', mountA)], null);
    const expected = [
      'readFileSync',
      'writeFileSync',
      'appendFileSync',
      'mkdirSync',
      'readdirSync',
      'statSync',
      'unlinkSync',
      'existsSync',
      'accessSync',
      'chmodSync',
      'copyFileSync',
      'renameSync',
      'createReadStream',
      'createWriteStream',
      'realpathSync',
    ];
    for (const name of expected) {
      expect(typeof isolatedFs[name]).toBe('function');
    }
  });

  it('wraps all expected promise functions', () => {
    const { isolatedFsPromises } = createIsolatedFs(
      [mount('w1', mountA)],
      null,
    );
    const expected = [
      'readFile',
      'writeFile',
      'appendFile',
      'mkdir',
      'readdir',
      'stat',
      'unlink',
      'access',
      'chmod',
      'copyFile',
      'rename',
      'realpath',
    ];
    for (const name of expected) {
      expect(typeof isolatedFsPromises[name]).toBe('function');
    }
  });
});

// =============================================================================
// mkdtemp (string-path wrapper)
// =============================================================================

describe('mkdtemp wrapper', () => {
  it('mkdtempSync creates temp dir inside mount', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    const tmpDir = isolatedFs.mkdtempSync('w1/tmp-');
    expect(tmpDir.startsWith(mountA)).toBe(true);
    expect(fs.statSync(tmpDir).isDirectory()).toBe(true);
  });
});

// =============================================================================
// Buffer / URL path inputs
// =============================================================================

describe('non-string path inputs', () => {
  it('accepts Buffer path', () => {
    const mounts = [mount('w1', mountA)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'buf.txt'), 'buffer-path');
    const content = isolatedFs.readFileSync(Buffer.from('w1/buf.txt'), 'utf-8');
    expect(content).toBe('buffer-path');
  });
});

// =============================================================================
// Mount Permissions — Full
// =============================================================================

describe('full permissions mount', () => {
  it('allows all operations', () => {
    const mounts = [mount('w1', mountA, FULL_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    isolatedFs.writeFileSync('w1/full.txt', 'hello', 'utf-8');
    expect(isolatedFs.readFileSync('w1/full.txt', 'utf-8')).toBe('hello');
    isolatedFs.writeFileSync('w1/full.txt', 'updated', 'utf-8');
    expect(isolatedFs.readdirSync('w1')).toContain('full.txt');
    isolatedFs.unlinkSync('w1/full.txt');
    expect(isolatedFs.existsSync('w1/full.txt')).toBe(false);
  });
});

// =============================================================================
// Mount Permissions — Append-Only
// =============================================================================

describe('append-only permissions mount', () => {
  it('allows read on existing files', () => {
    const mounts = [mount('att', mountA, APPEND_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'existing.txt'), 'data');
    expect(isolatedFs.readFileSync('att/existing.txt', 'utf-8')).toBe('data');
  });

  it('allows list', () => {
    const mounts = [mount('att', mountA, APPEND_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'a.txt'), '');
    expect(isolatedFs.readdirSync('att')).toContain('a.txt');
  });

  it('allows creating new files', () => {
    const mounts = [mount('att', mountA, APPEND_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    isolatedFs.writeFileSync('att/new-file.txt', 'created', 'utf-8');
    expect(fs.readFileSync(path.join(mountA, 'new-file.txt'), 'utf-8')).toBe(
      'created',
    );
  });

  it('blocks overwriting existing files', () => {
    const mounts = [mount('att', mountA, APPEND_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'locked.txt'), 'original');
    expect(() =>
      isolatedFs.writeFileSync('att/locked.txt', 'overwrite', 'utf-8'),
    ).toThrow(/Permission denied.*'edit'/);
  });

  it('blocks deleting files', () => {
    const mounts = [mount('att', mountA, APPEND_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'keep.txt'), 'keep');
    expect(() => isolatedFs.unlinkSync('att/keep.txt')).toThrow(
      /Permission denied.*'delete'/,
    );
  });

  it('blocks rm', () => {
    const mounts = [mount('att', mountA, APPEND_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'rm-target.txt'), 'data');
    expect(() =>
      isolatedFs.rmSync('att/rm-target.txt', { force: true }),
    ).toThrow(/Permission denied.*'delete'/);
  });

  it('error message includes mount prefix and permission set', () => {
    const mounts = [mount('att', mountA, APPEND_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'perm-msg.txt'), '');
    try {
      isolatedFs.unlinkSync('att/perm-msg.txt');
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e.message).toContain("mount 'att/'");
      expect(e.message).toContain('read, list, create');
    }
  });

  it('includes att-specific suggestion for edit denial', () => {
    const mounts = [mount('att', mountA, APPEND_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'overwrite-me.txt'), 'original');
    try {
      isolatedFs.writeFileSync('att/overwrite-me.txt', 'new', 'utf-8');
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e.message).toContain('API.createAttachment()');
    }
  });

  it('allows creating new files via async writeFile', async () => {
    const mounts = [mount('att', mountA, APPEND_ONLY_PERMISSIONS)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, null);

    await isolatedFsPromises.writeFile('att/async-new.txt', 'data');
    expect(fs.readFileSync(path.join(mountA, 'async-new.txt'), 'utf-8')).toBe(
      'data',
    );
  });

  it('blocks async overwrite of existing files', async () => {
    const mounts = [mount('att', mountA, APPEND_ONLY_PERMISSIONS)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'exists.txt'), 'original');
    await expect(
      isolatedFsPromises.writeFile('att/exists.txt', 'overwrite'),
    ).rejects.toThrow(/Permission denied.*'edit'/);
  });

  it('blocks async unlink', async () => {
    const mounts = [mount('att', mountA, APPEND_ONLY_PERMISSIONS)];
    const { isolatedFsPromises } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'async-keep.txt'), 'keep');
    await expect(
      isolatedFsPromises.unlink('att/async-keep.txt'),
    ).rejects.toThrow(/Permission denied.*'delete'/);
  });
});

// =============================================================================
// Mount Permissions — Read-Only
// =============================================================================

describe('read-only permissions mount', () => {
  it('allows read', () => {
    const mounts = [mount('ro', mountA, READ_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'readable.txt'), 'content');
    expect(isolatedFs.readFileSync('ro/readable.txt', 'utf-8')).toBe('content');
  });

  it('allows list', () => {
    const mounts = [mount('ro', mountA, READ_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'listed.txt'), '');
    expect(isolatedFs.readdirSync('ro')).toContain('listed.txt');
  });

  it('blocks creating new files', () => {
    const mounts = [mount('ro', mountA, READ_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    expect(() =>
      isolatedFs.writeFileSync('ro/blocked.txt', 'nope', 'utf-8'),
    ).toThrow(/Permission denied.*'create'/);
  });

  it('blocks editing existing files', () => {
    const mounts = [mount('ro', mountA, READ_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'immutable.txt'), 'original');
    expect(() =>
      isolatedFs.writeFileSync('ro/immutable.txt', 'changed', 'utf-8'),
    ).toThrow(/Permission denied.*'edit'/);
  });

  it('blocks deleting files', () => {
    const mounts = [mount('ro', mountA, READ_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'nodelete.txt'), 'keep');
    expect(() => isolatedFs.unlinkSync('ro/nodelete.txt')).toThrow(
      /Permission denied.*'delete'/,
    );
  });

  it('blocks mkdir', () => {
    const mounts = [mount('ro', mountA, READ_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    expect(() => isolatedFs.mkdirSync('ro/newdir')).toThrow(
      /Permission denied.*'create'/,
    );
  });

  it('error mentions read-only hint', () => {
    const mounts = [mount('ro', mountA, READ_ONLY_PERMISSIONS)];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    try {
      isolatedFs.writeFileSync('ro/fail.txt', 'nope', 'utf-8');
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e.message).toContain('read-only');
    }
  });
});

// =============================================================================
// Mount Permissions — Two-Path Operations
// =============================================================================

describe('two-path permission enforcement', () => {
  it('copyFile from read-only src to full-perm dst works', () => {
    const mounts = [
      mount('ro', mountA, READ_ONLY_PERMISSIONS),
      mount('w1', mountB, FULL_PERMISSIONS),
    ];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'src.txt'), 'data');
    isolatedFs.copyFileSync('ro/src.txt', 'w1/copy.txt');
    expect(fs.readFileSync(path.join(mountB, 'copy.txt'), 'utf-8')).toBe(
      'data',
    );
  });

  it('copyFile to read-only dst is blocked', () => {
    const mounts = [
      mount('w1', mountA, FULL_PERMISSIONS),
      mount('ro', mountB, READ_ONLY_PERMISSIONS),
    ];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'src.txt'), 'data');
    expect(() =>
      isolatedFs.copyFileSync('w1/src.txt', 'ro/blocked.txt'),
    ).toThrow(/Permission denied.*'create'/);
  });

  it('rename from append-only src is blocked (requires delete)', () => {
    const mounts = [
      mount('att', mountA, APPEND_ONLY_PERMISSIONS),
      mount('w1', mountB, FULL_PERMISSIONS),
    ];
    const { isolatedFs } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'move-me.txt'), 'data');
    expect(() =>
      isolatedFs.renameSync('att/move-me.txt', 'w1/moved.txt'),
    ).toThrow(/Permission denied.*'delete'/);
  });

  it('async copyFile respects permissions', async () => {
    const mounts = [
      mount('w1', mountA, FULL_PERMISSIONS),
      mount('ro', mountB, READ_ONLY_PERMISSIONS),
    ];
    const { isolatedFsPromises } = createIsolatedFs(mounts, null);

    fs.writeFileSync(path.join(mountA, 'async-src.txt'), 'data');
    await expect(
      isolatedFsPromises.copyFile('w1/async-src.txt', 'ro/blocked.txt'),
    ).rejects.toThrow(/Permission denied.*'create'/);
  });
});
