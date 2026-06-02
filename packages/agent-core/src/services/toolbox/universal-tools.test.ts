import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  copyToolExecute,
  deleteToolExecute,
  globToolExecute,
  grepSearchToolExecute,
  mkdirToolExecute,
  multiEditToolExecute,
  readToolExecute,
  writeToolExecute,
} from './universal-tools';
import type { UniversalToolboxDeps } from './types';
import type { HostPaths } from '../../host';

function makeHostPaths(root: string): HostPaths {
  return {
    dataDir: () => path.join(root, 'data'),
    tempDir: () => path.join(root, 'tmp'),
    agentsDir: () => path.join(root, 'agents'),
    agentDir: (agentId) => path.join(root, 'agents', agentId),
    agentAttachmentsDir: (agentId) =>
      path.join(root, 'agents', agentId, 'attachments'),
    agentAttachmentPath: (agentId, attachmentId) =>
      path.join(root, 'agents', agentId, 'attachments', attachmentId),
    agentAppsDir: (agentId) => path.join(root, 'agents', agentId, 'apps'),
    agentShellLogsDir: (agentId) =>
      path.join(root, 'agents', agentId, 'shells'),
    diffHistoryDir: () => path.join(root, 'diff-history'),
    diffHistoryDbPath: () => path.join(root, 'diff-history', 'db.sqlite'),
    diffHistoryBlobsDir: () => path.join(root, 'diff-history', 'blobs'),
    agentDbPath: () => path.join(root, 'agent.sqlite'),
    fileReadCacheDbPath: () => path.join(root, 'file-read-cache.sqlite'),
    processedImageCacheDbPath: () =>
      path.join(root, 'processed-image-cache.sqlite'),
    userDataDir: () => path.join(root, 'user-data'),
    plansDir: () => path.join(root, 'plans'),
    logsDir: () => path.join(root, 'logs'),
    pluginsDir: () => path.join(root, 'plugins'),
    builtinSkillsDir: () => path.join(root, 'plugins'),
    ripgrepBaseDir: () => path.join(root, 'rg'),
  };
}

function makeDeps(root: string, workspace: string): UniversalToolboxDeps {
  return {
    agentInstanceId: 'agent-1',
    hostPaths: makeHostPaths(root),
    staticMounts: [
      {
        prefix: 'wtest',
        absolutePath: workspace,
        permissions: ['read', 'write', 'create', 'delete'],
      },
      {
        prefix: 'readonly',
        absolutePath: path.join(root, 'readonly'),
        permissions: ['read'],
      },
    ],
    diffHistoryService: {
      ignoreFileForWatcher: vi.fn(),
      unignoreFileForWatcher: vi.fn(),
      registerAgentEdit: vi.fn(async () => {}),
    } as never,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe('universal toolbox', () => {
  let root: string;
  let workspace: string;
  let deps: UniversalToolboxDeps;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agent-core-toolbox-'));
    workspace = path.join(root, 'workspace');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(path.join(root, 'readonly'), { recursive: true });
    deps = makeDeps(root, workspace);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('validates read paths', async () => {
    writeFileSync(path.join(workspace, 'file.txt'), 'hello');
    await expect(
      readToolExecute({ path: 'wtest/file.txt' }, deps),
    ).resolves.toEqual({
      message: 'File opened and loaded into context.',
    });
  });

  it('creates directories and rejects read-only mounts', async () => {
    const result = await mkdirToolExecute({ path: 'wtest/a/b' }, deps);
    expect(result.message).toContain('Created directory');
    await expect(
      mkdirToolExecute({ path: 'readonly/x' }, deps),
    ).rejects.toThrow(/read-only/);
  });

  it('writes and multi-edits with diff history', async () => {
    const writeResult = await writeToolExecute(
      { path: 'wtest/file.txt', content: 'hello world' },
      deps,
      { toolCallId: 'tc-write' },
    );
    expect(writeResult.message).toContain('created');
    expect(readFileSync(path.join(workspace, 'file.txt'), 'utf-8')).toBe(
      'hello world',
    );

    const editResult = await multiEditToolExecute(
      {
        path: 'wtest/file.txt',
        edits: [{ old_string: 'world', new_string: 'stagewise' }],
      },
      deps,
      { toolCallId: 'tc-edit' },
    );
    expect(editResult.result.editsApplied).toBe(1);
    expect(readFileSync(path.join(workspace, 'file.txt'), 'utf-8')).toBe(
      'hello stagewise',
    );
    expect(deps.diffHistoryService?.registerAgentEdit).toHaveBeenCalled();
  });

  it('finds files with glob and grep', async () => {
    mkdirSync(path.join(workspace, 'src'), { recursive: true });
    writeFileSync(path.join(workspace, 'src', 'a.ts'), 'const value = 1;\n');
    writeFileSync(path.join(workspace, 'src', 'b.txt'), 'nope\n');

    // `**/` prefix is required for the runtime-node JS fallback to descend
    // into subdirectories (ripgrep handles `src/*.ts` directly, but we
    // can't assume rg is available in unit tests).
    const globResult = await globToolExecute(
      { mount_prefix: 'wtest', pattern: '**/src/*.ts' },
      deps,
    );
    expect(globResult.result.relativePaths).toEqual(['src/a.ts']);

    const grepResult = await grepSearchToolExecute(
      {
        mount_prefix: 'wtest',
        query: 'value',
        include_file_pattern: '**/*.ts',
      },
      deps,
    );
    expect(grepResult.result.matches).toHaveLength(1);
    expect(grepResult.result.matches[0]?.path).toBe('src/a.ts');
  });

  it('skips noisy gitignored directories by default and matches root-level **/X', async () => {
    // Root-level file that `**/README.md` must match.
    writeFileSync(path.join(workspace, 'README.md'), '# top\n');
    // A nested README to confirm `**` still matches deeper paths.
    mkdirSync(path.join(workspace, 'pkg'), { recursive: true });
    writeFileSync(path.join(workspace, 'pkg', 'README.md'), '# pkg\n');

    // Noisy directory that must be excluded by default — and is the
    // shape that triggered the stack overflow on real monorepos.
    mkdirSync(path.join(workspace, 'node_modules', 'foo'), {
      recursive: true,
    });
    writeFileSync(
      path.join(workspace, 'node_modules', 'foo', 'README.md'),
      'should be ignored\n',
    );

    const defaultRun = await globToolExecute(
      { mount_prefix: 'wtest', pattern: '**/README.md' },
      deps,
    );
    expect(defaultRun.result.relativePaths.sort()).toEqual([
      'README.md',
      'pkg/README.md',
    ]);

    // Opt-in: include_gitignored picks the node_modules tree back up.
    const openedUp = await globToolExecute(
      {
        mount_prefix: 'wtest',
        pattern: '**/README.md',
        include_gitignored: true,
      },
      deps,
    );
    expect(openedUp.result.relativePaths).toContain(
      'node_modules/foo/README.md',
    );
  });

  it('does not stack-overflow on directories with many entries', async () => {
    // The bug we're guarding against was `result.push(...inner)` with
    // an inner array large enough to cross V8's spread limit. Recursive
    // walks of pnpm monorepos pushed well past 100k. 2k flat entries
    // here is plenty to exercise the iterative path without slowing
    // CI.
    const big = path.join(workspace, 'big');
    mkdirSync(big, { recursive: true });
    for (let i = 0; i < 2000; i++) {
      writeFileSync(path.join(big, `f${i}.txt`), 'x');
    }
    const result = await globToolExecute(
      { mount_prefix: 'wtest', pattern: '**/big/*.txt' },
      deps,
    );
    // Capped at 50 by the universal-tools layer; we only care that the
    // walk completed without throwing and returned a non-zero match.
    expect(result.result.totalMatches).toBeGreaterThanOrEqual(50);
  });

  it('plumbs include_gitignored through to runtime-node', async () => {
    // A user-authored .gitignore that hides `secrets/`. Default glob
    // calls must honor it; `include_gitignored: true` must override it.
    writeFileSync(path.join(workspace, '.gitignore'), 'secrets/\n');
    mkdirSync(path.join(workspace, 'secrets'), { recursive: true });
    writeFileSync(path.join(workspace, 'secrets', 'leak.md'), 'shh\n');

    const respected = await globToolExecute(
      { mount_prefix: 'wtest', pattern: '**/leak.md' },
      deps,
    );
    expect(respected.result.relativePaths).not.toContain('secrets/leak.md');

    const overridden = await globToolExecute(
      {
        mount_prefix: 'wtest',
        pattern: '**/leak.md',
        include_gitignored: true,
      },
      deps,
    );
    expect(overridden.result.relativePaths).toContain('secrets/leak.md');
  });

  // ---------------------------------------------------------------------------
  // Move / delete diff-history tracking — guards against the regression
  // introduced when copy/delete were ported from the browser toolbox to the
  // shared universal-tools helper. Origin/main captured every removed file
  // individually so the watcher would not surface them as "external"
  // changes; without these tests the regression silently re-lands.
  // ---------------------------------------------------------------------------

  function getRegisteredEditPaths(): string[] {
    const mock = deps.diffHistoryService?.registerAgentEdit as ReturnType<
      typeof vi.fn
    >;
    return mock.mock.calls.map((call) => (call[0] as { path: string }).path);
  }

  it('move (single file): registers an edit for src deletion AND dest creation', async () => {
    writeFileSync(path.join(workspace, 'a.txt'), 'hello');

    const result = await copyToolExecute(
      {
        input_path: 'wtest/a.txt',
        output_path: 'wtest/b.txt',
        move: true,
      },
      deps,
      { toolCallId: 'tc-move-single' },
    );

    expect(result?.message).toContain('Moved');
    const paths = getRegisteredEditPaths();
    expect(paths).toContain(path.join(workspace, 'a.txt'));
    expect(paths).toContain(path.join(workspace, 'b.txt'));
    // Watcher ignore should fire for BOTH paths, not just dest.
    const ignoreMock = deps.diffHistoryService
      ?.ignoreFileForWatcher as ReturnType<typeof vi.fn>;
    const ignored = ignoreMock.mock.calls.map((c) => c[0]);
    expect(ignored).toContain(path.join(workspace, 'a.txt'));
    expect(ignored).toContain(path.join(workspace, 'b.txt'));
  });

  it('move (directory): registers an edit for every src AND dest file under the moved tree', async () => {
    mkdirSync(path.join(workspace, 'src', 'nested'), { recursive: true });
    writeFileSync(path.join(workspace, 'src', 'a.txt'), 'a');
    writeFileSync(path.join(workspace, 'src', 'b.txt'), 'b');
    writeFileSync(path.join(workspace, 'src', 'nested', 'c.txt'), 'c');

    await copyToolExecute(
      {
        input_path: 'wtest/src',
        output_path: 'wtest/dst',
        move: true,
      },
      deps,
      { toolCallId: 'tc-move-dir' },
    );

    const paths = getRegisteredEditPaths();
    // Source-side deletions
    expect(paths).toContain(path.join(workspace, 'src', 'a.txt'));
    expect(paths).toContain(path.join(workspace, 'src', 'b.txt'));
    expect(paths).toContain(path.join(workspace, 'src', 'nested', 'c.txt'));
    // Destination-side creations (without these, undo restores src but
    // leaves dst in place — duplicating the tree)
    expect(paths).toContain(path.join(workspace, 'dst', 'a.txt'));
    expect(paths).toContain(path.join(workspace, 'dst', 'b.txt'));
    expect(paths).toContain(path.join(workspace, 'dst', 'nested', 'c.txt'));
  });

  it('copy (directory, no move): registers an edit for every dest file but NOT any src file', async () => {
    mkdirSync(path.join(workspace, 'src', 'nested'), { recursive: true });
    writeFileSync(path.join(workspace, 'src', 'a.txt'), 'a');
    writeFileSync(path.join(workspace, 'src', 'nested', 'c.txt'), 'c');

    await copyToolExecute(
      {
        input_path: 'wtest/src',
        output_path: 'wtest/dst',
        move: false,
      },
      deps,
      { toolCallId: 'tc-copy-dir' },
    );

    const paths = getRegisteredEditPaths();
    expect(paths).toContain(path.join(workspace, 'dst', 'a.txt'));
    expect(paths).toContain(path.join(workspace, 'dst', 'nested', 'c.txt'));
    // Source files must remain intact and not appear as deletions.
    expect(paths).not.toContain(path.join(workspace, 'src', 'a.txt'));
    expect(paths).not.toContain(path.join(workspace, 'src', 'nested', 'c.txt'));
  });

  it('copy (no move): does NOT register an edit for the source path', async () => {
    writeFileSync(path.join(workspace, 'a.txt'), 'hello');

    await copyToolExecute(
      {
        input_path: 'wtest/a.txt',
        output_path: 'wtest/b.txt',
        move: false,
      },
      deps,
      { toolCallId: 'tc-copy-single' },
    );

    const paths = getRegisteredEditPaths();
    expect(paths).not.toContain(path.join(workspace, 'a.txt'));
    expect(paths).toContain(path.join(workspace, 'b.txt'));
  });

  it('delete (directory): registers an edit for every child file', async () => {
    mkdirSync(path.join(workspace, 'tree', 'inner'), { recursive: true });
    writeFileSync(path.join(workspace, 'tree', 'a.txt'), 'a');
    writeFileSync(path.join(workspace, 'tree', 'b.txt'), 'b');
    writeFileSync(path.join(workspace, 'tree', 'inner', 'c.txt'), 'c');

    await deleteToolExecute({ path: 'wtest/tree' }, deps, {
      toolCallId: 'tc-delete-dir',
    });

    const paths = getRegisteredEditPaths();
    expect(paths).toContain(path.join(workspace, 'tree', 'a.txt'));
    expect(paths).toContain(path.join(workspace, 'tree', 'b.txt'));
    expect(paths).toContain(path.join(workspace, 'tree', 'inner', 'c.txt'));
  });

  it('delete (single file): registers exactly one edit and leaves the existing behavior intact', async () => {
    writeFileSync(path.join(workspace, 'lone.txt'), 'bye');

    await deleteToolExecute({ path: 'wtest/lone.txt' }, deps, {
      toolCallId: 'tc-delete-file',
    });

    const paths = getRegisteredEditPaths();
    expect(paths).toEqual([path.join(workspace, 'lone.txt')]);
  });
});
