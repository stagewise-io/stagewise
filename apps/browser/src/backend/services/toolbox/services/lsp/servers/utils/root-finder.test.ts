import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import nodeFs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hasFileInTree } from './root-finder';

let root: string;

beforeEach(async () => {
  root = path.join(os.tmpdir(), `root-finder-${randomUUID()}`);
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

describe('hasFileInTree', () => {
  it('finds a marker at the root', async () => {
    await touch('Cargo.toml');
    expect(await hasFileInTree(root, ['Cargo.toml'])).toBe(true);
  });

  it('finds a nested marker (monorepo crate without root manifest)', async () => {
    await touch('crates/foo/Cargo.toml');
    expect(await hasFileInTree(root, ['Cargo.toml'])).toBe(true);
  });

  it('finds compile_commands.json kept under build/', async () => {
    await touch('build/compile_commands.json');
    expect(await hasFileInTree(root, ['compile_commands.json'])).toBe(true);
  });

  it('finds a deeply nested marker at the default depth (packages/backend/crates/foo)', async () => {
    await touch('packages/backend/crates/foo/Cargo.toml');
    expect(await hasFileInTree(root, ['Cargo.toml'])).toBe(true);
  });

  it('returns false when no marker exists', async () => {
    await touch('src/main.rs');
    expect(await hasFileInTree(root, ['Cargo.toml'])).toBe(false);
  });

  it('skips heavy directories like target/', async () => {
    await touch('target/Cargo.toml');
    expect(await hasFileInTree(root, ['Cargo.toml'])).toBe(false);
  });

  it('respects maxDepth', async () => {
    await touch('a/b/c/d/Cargo.toml');
    expect(await hasFileInTree(root, ['Cargo.toml'], { maxDepth: 2 })).toBe(
      false,
    );
    expect(await hasFileInTree(root, ['Cargo.toml'], { maxDepth: 5 })).toBe(
      true,
    );
  });
});
