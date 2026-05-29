import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import nodeFs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  findExecutableOnPath,
  findInDirs,
  runCommandForPath,
} from './binary-finder';

const isWindows = process.platform === 'win32';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `binary-finder-${randomUUID()}`);
  await nodeFs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await nodeFs.rm(tmpDir, { recursive: true, force: true });
});

/** Create a fake executable file and return its bare name. */
async function makeExecutable(name: string): Promise<string> {
  const full = path.join(tmpDir, name);
  await nodeFs.writeFile(full, '#!/bin/sh\necho hi\n');
  if (!isWindows) await nodeFs.chmod(full, 0o755);
  return full;
}

describe('findInDirs', () => {
  it('finds an executable in a provided directory', async () => {
    const name = isWindows ? 'mytool.exe' : 'mytool';
    await makeExecutable(name);
    const found = await findInDirs('mytool', [tmpDir]);
    expect(found).toBe(path.join(tmpDir, name));
  });

  it('returns undefined when the binary is absent', async () => {
    const found = await findInDirs('does-not-exist', [tmpDir]);
    expect(found).toBeUndefined();
  });

  it('ignores empty directory entries', async () => {
    const name = isWindows ? 'mytool.exe' : 'mytool';
    await makeExecutable(name);
    const found = await findInDirs('mytool', ['', tmpDir]);
    expect(found).toBe(path.join(tmpDir, name));
  });
});

describe('findExecutableOnPath', () => {
  it('splits PATH on the platform delimiter and resolves a match', async () => {
    const name = isWindows ? 'mytool.exe' : 'mytool';
    await makeExecutable(name);
    const otherDir = path.join(tmpDir, 'empty');
    await nodeFs.mkdir(otherDir, { recursive: true });

    const PATH = [otherDir, tmpDir].join(path.delimiter);
    const found = await findExecutableOnPath('mytool', { PATH });
    expect(found).toBe(path.join(tmpDir, name));
  });

  it('honors a lowercase Path key (Windows env block casing)', async () => {
    const name = isWindows ? 'mytool.exe' : 'mytool';
    await makeExecutable(name);
    const found = await findExecutableOnPath('mytool', { Path: tmpDir });
    expect(found).toBe(path.join(tmpDir, name));
  });

  it('returns undefined when PATH is empty', async () => {
    const found = await findExecutableOnPath('mytool', { PATH: '' });
    expect(found).toBeUndefined();
  });
});

describe('runCommandForPath', () => {
  it('returns the first non-empty stdout line on success', async () => {
    const out = await runCommandForPath(process.execPath, [
      '-e',
      "process.stdout.write('\\n  /path/to/bin  \\nsecond')",
    ]);
    expect(out).toBe('/path/to/bin');
  });

  it('returns undefined on non-zero exit', async () => {
    const out = await runCommandForPath(process.execPath, [
      '-e',
      'process.exit(1)',
    ]);
    expect(out).toBeUndefined();
  });

  it('returns undefined when the command cannot be spawned', async () => {
    const out = await runCommandForPath('definitely-not-a-real-binary-xyz', [
      '--version',
    ]);
    expect(out).toBeUndefined();
  });

  it('returns undefined on timeout', async () => {
    const out = await runCommandForPath(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 1000)'],
      undefined,
      10,
    );
    expect(out).toBeUndefined();
  });
});
