import { mkdtemp, mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('__APP_BASE_NAME__', 'stagewise-test');
  vi.stubGlobal('__APP_NAME__', 'stagewise-test');
  vi.stubGlobal('__APP_BUNDLE_ID__', 'io.stagewise.test');
  vi.stubGlobal('__APP_VERSION__', '0.0.0-test');
  vi.stubGlobal('__APP_PLATFORM__', 'darwin');
  vi.stubGlobal('__APP_AUTHOR__', 'stagewise');
  vi.stubGlobal('__APP_COPYRIGHT__', 'stagewise');
  vi.stubGlobal('__APP_HOMEPAGE__', 'https://stagewise.io');
  vi.stubGlobal('__APP_ARCH__', 'arm64');
});

import type { Logger } from '../logger';
import type { KartonService } from '../karton';
import type { AppState } from '@shared/karton-contracts/ui';
import { FileTreeService } from './index';

const electronMock = vi.hoisted(() => ({
  showItemInFolder: vi.fn(),
}));

vi.mock('electron', () => ({
  shell: {
    showItemInFolder: electronMock.showItemInFolder,
  },
}));

type MutableState = Pick<
  AppState,
  'browser' | 'contentTabs' | 'fileTree' | 'toolbox' | 'workspaceMounts'
>;

function createKarton(state: MutableState): KartonService {
  const callbacks = new Set<() => void>();
  return {
    get state() {
      return state;
    },
    setState: vi.fn((updater: (draft: AppState) => void) => {
      updater(state as AppState);
      for (const callback of callbacks) callback();
    }),
    registerStateChangeCallback: vi.fn((callback: () => void) => {
      callbacks.add(callback);
    }),
    unregisterStateChangeCallback: vi.fn((callback: () => void) => {
      callbacks.delete(callback);
    }),
  } as unknown as KartonService;
}

function createState(root: string): MutableState {
  return {
    workspaceMounts: [
      {
        prefix: 'wtest',
        path: root,
        git: null,
        skills: [],
        agentsMdContent: null,
      },
    ],
    browser: {
      lastOpenAgentId: null,
    } as AppState['browser'],
    contentTabs: {
      activeTabId: null,
      tabs: {},
    } as AppState['contentTabs'],
    fileTree: {
      visible: false,
      activeWorkspaceKey: null,
      viewMode: 'files' as const,
      expandedDirectoriesByWorkspaceKey: {},
      workspaceRevisions: {},
      directoryRevisions: {},
    },
    toolbox: {},
  };
}

const logger = {
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
} as unknown as Logger;

describe('FileTreeService', () => {
  let root: string;
  let externalRoot: string;
  let state: MutableState;
  let karton: KartonService;
  let service: FileTreeService;
  let workspaceKey: string;

  beforeEach(async () => {
    electronMock.showItemInFolder.mockClear();
    root = await mkdtemp(path.join(tmpdir(), 'stagewise-file-tree-root-'));
    externalRoot = await mkdtemp(
      path.join(tmpdir(), 'stagewise-file-tree-external-'),
    );
    state = createState(root);
    karton = createKarton(state);
    service = await FileTreeService.create(logger, karton);
    workspaceKey = service.getWorkspaceKey({ prefix: 'wtest', path: root });
  });

  afterEach(async () => {
    await service.teardown();
  });

  it('rejects path traversal outside the workspace', async () => {
    await expect(
      service.listDirectory({ workspaceKey, directoryPath: '..' }),
    ).rejects.toThrow('Path traversal denied');
  });

  it('rejects symlink escapes outside the workspace', async () => {
    await writeFile(path.join(externalRoot, 'secret.txt'), 'secret');
    await symlink(externalRoot, path.join(root, 'external'));

    await expect(
      service.listDirectory({ workspaceKey, directoryPath: 'external' }),
    ).rejects.toThrow('Path escapes workspace root');
  });

  it('resolves mounted workspaces from global and toolbox mounts', async () => {
    const toolboxRoot = await mkdtemp(
      path.join(tmpdir(), 'stagewise-file-tree-toolbox-'),
    );
    state.workspaceMounts = [];
    state.toolbox.agentA = {
      workspace: {
        mounts: [
          {
            prefix: 'wbox',
            path: toolboxRoot,
            git: null,
            skills: [],
            agentsMdContent: null,
          },
        ],
      },
      pendingFileDiffs: [],
      editSummary: [],
      pendingUserQuestion: null,
    };
    await writeFile(path.join(toolboxRoot, 'file.txt'), 'hello');
    const key = service.getWorkspaceKey({ prefix: 'wbox', path: toolboxRoot });

    const result = await service.listDirectory({
      workspaceKey: key,
      directoryPath: '',
    });

    expect(result.entries.map((entry) => entry.name)).toEqual(['file.txt']);
  });

  it('paginates directory entries with stable cursors', async () => {
    await Promise.all(
      Array.from({ length: 7 }, (_, index) =>
        writeFile(path.join(root, `file-${index}.txt`), String(index)),
      ),
    );

    const first = await service.listDirectory({
      workspaceKey,
      directoryPath: '',
      limit: 3,
    });
    const second = await service.listDirectory({
      workspaceKey,
      directoryPath: '',
      cursor: first.nextCursor,
      limit: 3,
    });
    const third = await service.listDirectory({
      workspaceKey,
      directoryPath: '',
      cursor: second.nextCursor,
      limit: 3,
    });

    expect(first.entries).toHaveLength(3);
    expect(first.nextCursor).toBe('3');
    expect(second.entries).toHaveLength(3);
    expect(second.nextCursor).toBe('6');
    expect(third.entries).toHaveLength(1);
    expect(third.nextCursor).toBeNull();
  });

  it('hides internal folders and marks ignored entries', async () => {
    await mkdir(path.join(root, 'node_modules'));
    await mkdir(path.join(root, 'visible'));
    await writeFile(path.join(root, '.gitignore'), 'ignored.txt\n');
    await writeFile(path.join(root, 'ignored.txt'), 'ignore me');
    await writeFile(path.join(root, 'visible.txt'), 'show me');

    const result = await service.listDirectory({
      workspaceKey,
      directoryPath: '',
    });

    expect(result.entries.map((entry) => entry.name)).toEqual([
      'node_modules',
      'visible',
      '.gitignore',
      'ignored.txt',
      'visible.txt',
    ]);
    expect(
      result.entries.map((entry) => [entry.name, entry.isIgnored]),
    ).toEqual([
      ['node_modules', true],
      ['visible', false],
      ['.gitignore', false],
      ['ignored.txt', true],
      ['visible.txt', false],
    ]);
  });

  it('creates a new folder in the selected directory', async () => {
    await mkdir(path.join(root, 'parent'));
    await service.listDirectory({
      workspaceKey,
      directoryPath: 'parent',
    });

    const result = await service.createFolder(workspaceKey, 'parent');
    const listing = await service.listDirectory({
      workspaceKey,
      directoryPath: 'parent',
    });

    expect(result).toEqual({
      success: true,
      relativePath: 'parent/new folder',
    });
    expect(listing.entries).toEqual([
      expect.objectContaining({
        kind: 'directory',
        name: 'new folder',
        relativePath: 'parent/new folder',
      }),
    ]);
  });

  it('uses the next available name when creating a folder', async () => {
    await mkdir(path.join(root, 'new folder'));
    await writeFile(path.join(root, 'new folder 2'), 'occupied');

    const result = await service.createFolder(workspaceKey, '');

    expect(result).toEqual({
      success: true,
      relativePath: 'new folder 3',
    });
    await expect(realpath(path.join(root, 'new folder 3'))).resolves.toBe(
      path.join(await realpath(root), 'new folder 3'),
    );
  });

  it('classifies text, image, svg, and binary previews', async () => {
    await writeFile(path.join(root, 'text.txt'), 'hello');
    await writeFile(
      path.join(root, 'vector.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    );
    await writeFile(
      path.join(root, 'image.png'),
      Buffer.from('89504e470d0a1a0a', 'hex'),
    );
    await writeFile(path.join(root, 'binary.bin'), Buffer.from([0, 1, 2, 3]));

    await expect(
      service.getFilePreview(workspaceKey, 'text.txt'),
    ).resolves.toMatchObject({ kind: 'text', text: 'hello' });
    await expect(
      service.getFilePreview(workspaceKey, 'vector.svg'),
    ).resolves.toMatchObject({ kind: 'svg' });
    await expect(
      service.getFilePreview(workspaceKey, 'image.png'),
    ).resolves.toMatchObject({ kind: 'image' });
    await expect(
      service.getFilePreview(workspaceKey, 'binary.bin'),
    ).resolves.toMatchObject({ kind: 'binary' });
  });

  it('reveals only validated workspace paths', async () => {
    await writeFile(path.join(root, 'file.txt'), 'hello');
    await service.revealInFolder(workspaceKey, 'file.txt');

    expect(electronMock.showItemInFolder).toHaveBeenCalledWith(
      await realpath(path.join(root, 'file.txt')),
    );

    electronMock.showItemInFolder.mockClear();
    const result = await service.revealInFolder(workspaceKey, '../file.txt');

    expect(result.success).toBe(false);
    expect(electronMock.showItemInFolder).not.toHaveBeenCalled();
  });
});
