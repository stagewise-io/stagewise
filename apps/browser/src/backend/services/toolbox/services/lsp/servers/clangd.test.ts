import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import nodeFs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { clangdServer } from './clangd';

let root: string;

beforeEach(async () => {
  root = path.join(os.tmpdir(), `clangd-activate-${randomUUID()}`);
  await nodeFs.mkdir(root, { recursive: true });
});

afterEach(async () => {
  await nodeFs.rm(root, { recursive: true, force: true });
});

async function touch(relPath: string): Promise<void> {
  const full = path.join(root, relPath);
  await nodeFs.mkdir(path.dirname(full), { recursive: true });
  await nodeFs.writeFile(full, '');
}

describe('clangdServer.shouldActivate', () => {
  // compile_flags.txt is the minimal clangd compilation database and a very
  // common single-target setup; it must activate clangd. (Regression: it was
  // initially missing from the marker list, so projects using only
  // compile_flags.txt never started the server.)
  it('activates on compile_flags.txt', async () => {
    await touch('compile_flags.txt');
    expect(await clangdServer.shouldActivate(root)).toBe(true);
  });

  it('activates on compile_commands.json', async () => {
    await touch('compile_commands.json');
    expect(await clangdServer.shouldActivate(root)).toBe(true);
  });

  it('activates on a nested compile_flags.txt', async () => {
    await touch('src/module/compile_flags.txt');
    expect(await clangdServer.shouldActivate(root)).toBe(true);
  });

  it('activates on CMakeLists.txt / Makefile casings', async () => {
    await touch('CMakeLists.txt');
    expect(await clangdServer.shouldActivate(root)).toBe(true);
  });

  it('does NOT activate on source-only projects (no build info)', async () => {
    await touch('src/main.c');
    await touch('include/greet.h');
    expect(await clangdServer.shouldActivate(root)).toBe(false);
  });
});
