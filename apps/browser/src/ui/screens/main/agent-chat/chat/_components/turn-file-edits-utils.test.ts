import { describe, expect, it } from 'vitest';
import type { ToolCallFileEdit } from '@shared/karton-contracts/ui/shared-types';
import type { Mount } from '@shared/karton-contracts/ui/agent/metadata';
import { resolveWorkspaceFileLocation } from '@ui/utils/workspace-path';
import { buildTurnFileTree } from './turn-file-edits-utils';

function fileEdit(
  path: string,
  added: number,
  removed: number,
  toolCallId: string,
): ToolCallFileEdit {
  return { path, added, removed, toolCallIds: [toolCallId] };
}

const mount: Mount = {
  prefix: 'ws',
  path: '/repo',
  permissions: ['read', 'list', 'create', 'edit', 'delete'],
};

describe('turn file edits tree', () => {
  it('groups files by directory and aggregates line stats', () => {
    const tree = buildTurnFileTree(
      [
        fileEdit('/repo/src/pages/index.tsx', 2, 1, 'tool-1'),
        fileEdit('/repo/src/lib/constants.ts', 9, 0, 'tool-2'),
        fileEdit('/repo/package.json', 1, 0, 'tool-3'),
      ],
      [mount],
    );

    expect(tree.nodes.map((node) => node.name)).toEqual([
      'src',
      'package.json',
    ]);
    expect(tree.nodes[0]).toMatchObject({
      type: 'folder',
      name: 'src',
      added: 11,
      removed: 1,
    });
    expect(tree.folderKeys.sort()).toEqual(['src', 'src/lib', 'src/pages']);
    expect(tree).toMatchObject({ added: 12, removed: 1 });
  });

  it('adds workspace roots when a turn spans multiple mounts', () => {
    const tree = buildTurnFileTree(
      [
        fileEdit('/repo/src/index.ts', 1, 0, 'tool-1'),
        fileEdit('/docs/README.md', 2, 0, 'tool-2'),
      ],
      [
        mount,
        {
          ...mount,
          prefix: 'docs',
          path: '/docs',
        },
      ],
    );

    expect(tree.nodes.map((node) => node.name)).toEqual(['docs', 'repo']);
  });

  it('keeps mounts with the same folder name separate', () => {
    const tree = buildTurnFileTree(
      [
        fileEdit('/team-a/app/src/a.ts', 1, 0, 'tool-1'),
        fileEdit('/team-b/app/src/b.ts', 2, 0, 'tool-2'),
      ],
      [
        { ...mount, prefix: 'team-a-app', path: '/team-a/app' },
        { ...mount, prefix: 'team-b-app', path: '/team-b/app' },
      ],
    );

    expect(tree.nodes).toHaveLength(2);
    expect(tree.nodes).toMatchObject([
      { type: 'folder', name: 'app', key: '/team-a/app', added: 1 },
      { type: 'folder', name: 'app', key: '/team-b/app', added: 2 },
    ]);
  });

  it('resolves a file against its closest workspace mount', () => {
    const nestedMount = {
      ...mount,
      prefix: 'app',
      path: '/repo/packages/app',
    };

    expect(
      resolveWorkspaceFileLocation('/repo/packages/app/src/index.ts', [
        mount,
        nestedMount,
      ]),
    ).toEqual({ mount: nestedMount, relativePath: 'src/index.ts' });
  });
});
