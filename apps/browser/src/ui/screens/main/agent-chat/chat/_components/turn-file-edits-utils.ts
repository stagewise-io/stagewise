import type { ToolCallFileEdit } from '@shared/karton-contracts/ui/shared-types';
import type { Mount } from '@shared/karton-contracts/ui/agent/metadata';
import { getBaseName, normalizePath, splitSegments } from '@shared/path-utils';
import { resolveWorkspaceFileLocation } from '@ui/utils/workspace-path';

export type TurnFileTreeNode =
  | {
      type: 'folder';
      key: string;
      name: string;
      added: number;
      removed: number;
      children: TurnFileTreeNode[];
    }
  | {
      type: 'file';
      name: string;
      edit: ToolCallFileEdit;
    };

export type TurnFileTree = {
  nodes: TurnFileTreeNode[];
  folderKeys: string[];
  added: number;
  removed: number;
};

function getDisplayPath(
  path: string,
  mounts: Mount[],
): { segments: string[]; rootKey?: string } {
  const normalizedPath = normalizePath(path);
  const match = resolveWorkspaceFileLocation(normalizedPath, mounts);

  if (!match) return { segments: splitSegments(normalizedPath) };

  const relativeSegments = splitSegments(match.relativePath);
  if (mounts.length <= 1) return { segments: relativeSegments };

  return {
    segments: [
      getBaseName(match.mount.path) || match.mount.prefix,
      ...relativeSegments,
    ],
    rootKey: normalizePath(match.mount.path).replace(/\/$/, ''),
  };
}

type MutableFolder = Extract<TurnFileTreeNode, { type: 'folder' }>;

function sortTree(nodes: TurnFileTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.type === 'folder') sortTree(node.children);
  }
}

export function buildTurnFileTree(
  edits: ToolCallFileEdit[],
  mounts: Mount[],
): TurnFileTree {
  const root: MutableFolder = {
    type: 'folder',
    key: '',
    name: '',
    added: 0,
    removed: 0,
    children: [],
  };
  const folderKeys: string[] = [];
  const foldersByKey = new Map<string, MutableFolder>();

  for (const edit of edits) {
    const { segments, rootKey } = getDisplayPath(edit.path, mounts);
    const fileName = segments.pop();
    if (!fileName) continue;

    root.added += edit.added;
    root.removed += edit.removed;

    let parent = root;
    const pathParts: string[] = [];
    for (const segment of segments) {
      pathParts.push(segment);
      const key = rootKey
        ? [rootKey, ...pathParts.slice(1)].join('/')
        : pathParts.join('/');
      let folder = foldersByKey.get(key);
      if (!folder) {
        folder = {
          type: 'folder',
          key,
          name: segment,
          added: 0,
          removed: 0,
          children: [],
        };
        parent.children.push(folder);
        foldersByKey.set(key, folder);
        folderKeys.push(key);
      }
      folder.added += edit.added;
      folder.removed += edit.removed;
      parent = folder;
    }

    parent.children.push({
      type: 'file',
      name: fileName,
      edit,
    });
  }

  sortTree(root.children);
  return {
    nodes: root.children,
    folderKeys,
    added: root.added,
    removed: root.removed,
  };
}
