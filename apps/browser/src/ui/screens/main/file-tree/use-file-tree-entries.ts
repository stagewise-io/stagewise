import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import type { FileTreeEntry } from '@shared/karton-contracts/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

const PAGE_LIMIT = 100;

type DirectoryData = {
  entries: FileTreeEntry[];
  nextCursor: string | null;
  revision: number;
  isLoading: boolean;
  error: string | null;
};

export type FileTreeRow =
  | {
      type: 'entry';
      id: string;
      entry: FileTreeEntry;
      depth: number;
      expanded: boolean;
      loading: boolean;
    }
  | {
      type: 'load-more';
      id: string;
      directoryPath: string;
      depth: number;
    }
  | {
      type: 'error';
      id: string;
      message: string;
      depth: number;
    }
  | {
      type: 'loading';
      id: string;
      depth: number;
    };

const EMPTY_DIRECTORY_DATA: DirectoryData = {
  entries: [],
  nextCursor: null,
  revision: 0,
  isLoading: false,
  error: null,
};

const EMPTY_DIRECTORY_REVISIONS: Record<string, number> = {};

const cache = new Map<string, Omit<DirectoryData, 'isLoading' | 'error'>>();

export function useFileTreeEntries(workspaceKey: string | null) {
  const workspaceRevision = useKartonState((s) =>
    workspaceKey ? (s.fileTree.workspaceRevisions[workspaceKey] ?? 0) : 0,
  );
  const directoryRevisions = useKartonState(
    useComparingSelector((s) =>
      workspaceKey
        ? (s.fileTree.directoryRevisions?.[workspaceKey] ?? {})
        : EMPTY_DIRECTORY_REVISIONS,
    ),
  );
  const expandedPaths = useKartonState(
    useComparingSelector((s) =>
      workspaceKey
        ? (s.fileTree.expandedDirectoriesByWorkspaceKey[workspaceKey] ?? [])
        : [],
    ),
  );
  const listDirectory = useKartonProcedure((p) => p.fileTree.listDirectory);
  const [directories, setDirectories] = useState<Record<string, DirectoryData>>(
    {},
  );

  const loadDirectory = useCallback(
    async (directoryPath: string, cursor: string | null = null) => {
      if (!workspaceKey) return;
      const directoryRevision =
        directoryRevisions[directoryPath] ?? workspaceRevision;
      const cacheKey = `${workspaceKey}:${directoryPath}:${directoryRevision}`;
      if (!cursor) {
        const cached = cache.get(cacheKey);
        if (cached) {
          setDirectories((prev) => ({
            ...prev,
            [directoryPath]: { ...cached, isLoading: false, error: null },
          }));
          return;
        }
      }

      setDirectories((prev) => {
        const current = prev[directoryPath] ?? EMPTY_DIRECTORY_DATA;
        if (current.isLoading && current.revision === directoryRevision) {
          return prev;
        }
        return {
          ...prev,
          [directoryPath]: {
            ...current,
            revision: directoryRevision,
            isLoading: true,
            error: null,
          },
        };
      });

      try {
        const result = await listDirectory({
          workspaceKey,
          directoryPath,
          cursor,
          limit: PAGE_LIMIT,
        });
        setDirectories((prev) => {
          const current = prev[directoryPath] ?? EMPTY_DIRECTORY_DATA;
          const entries = cursor
            ? [...current.entries, ...result.entries]
            : result.entries;
          cache.set(cacheKey, {
            entries,
            nextCursor: result.nextCursor,
            revision: result.revision,
          });
          return {
            ...prev,
            [directoryPath]: {
              entries,
              nextCursor: result.nextCursor,
              revision: result.revision,
              isLoading: false,
              error: null,
            },
          };
        });
      } catch (error) {
        setDirectories((prev) => ({
          ...prev,
          [directoryPath]: {
            ...(prev[directoryPath] ?? EMPTY_DIRECTORY_DATA),
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to load',
          },
        }));
      }
    },
    [directoryRevisions, listDirectory, workspaceRevision, workspaceKey],
  );

  // Reset state only when the workspace changes, not on every revision
  // bump. The missingDirectoryPaths computation below already detects
  // stale cached entries and triggers re-fetches without a flash.
  useEffect(() => {
    setDirectories({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceKey]);

  const missingDirectoryPaths = useMemo(() => {
    if (!workspaceKey) return [];
    return ['', ...expandedPaths].filter((path) => {
      const directory = directories[path];
      const revision = directoryRevisions[path] ?? workspaceRevision;
      return (
        !directory || (!directory.isLoading && directory.revision !== revision)
      );
    });
  }, [
    directories,
    directoryRevisions,
    expandedPaths,
    workspaceKey,
    workspaceRevision,
  ]);

  useEffect(() => {
    if (!workspaceKey) return;
    for (const path of missingDirectoryPaths) {
      void loadDirectory(path);
    }
  }, [loadDirectory, missingDirectoryPaths, workspaceKey]);

  const expandedSet = useMemo(() => new Set(expandedPaths), [expandedPaths]);

  const rows = useMemo<FileTreeRow[]>(() => {
    if (!workspaceKey) return [];
    const output: FileTreeRow[] = [];

    const appendDirectory = (directoryPath: string, depth: number) => {
      const directory = directories[directoryPath];
      if (!directory) {
        output.push({
          type: 'loading',
          id: `${directoryPath}:loading`,
          depth,
        });
        return;
      }

      if (directory.error) {
        output.push({
          type: 'error',
          id: `${directoryPath}:error`,
          message: directory.error,
          depth,
        });
      }

      for (const entry of directory.entries) {
        const expanded = expandedSet.has(entry.relativePath);
        output.push({
          type: 'entry',
          id: entry.relativePath,
          entry,
          depth,
          expanded,
          loading:
            entry.kind === 'directory' &&
            expanded &&
            (directories[entry.relativePath]?.isLoading ?? false),
        });
        if (entry.kind === 'directory' && expanded) {
          appendDirectory(entry.relativePath, depth + 1);
        }
      }

      if (directory.nextCursor) {
        output.push({
          type: 'load-more',
          id: `${directoryPath}:load-more`,
          directoryPath,
          depth,
        });
      }
    };

    appendDirectory('', 0);
    return output;
  }, [directories, expandedSet, workspaceKey]);

  const loadMore = useCallback(
    (directoryPath: string) => {
      const directory = directories[directoryPath];
      if (!directory?.nextCursor || directory.isLoading) return;
      void loadDirectory(directoryPath, directory.nextCursor);
    },
    [directories, loadDirectory],
  );

  return {
    rows,
    loadMore,
  };
}
