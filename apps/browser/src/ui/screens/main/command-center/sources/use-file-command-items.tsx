import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderIcon } from 'lucide-react';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { FileIcon } from '@ui/components/file-icon';
import { getBaseName } from '@shared/path-utils';
import {
  getFileTreeWorkspaceKey,
  getFileTreeWorkspaceMountsForAgent,
  getFileTreeWorkspaceName,
} from '@ui/screens/main/file-tree/file-tree-utils';
import type { FileCommandItem } from '../command-center-model';

const SEARCH_DEBOUNCE_MS = 70;
const KEY_SEPARATOR = '\u0000';
const RECENT_FILE_LIMIT = 8;

export type FileSearchFilterState = {
  selectedWorkspaceKeys: Set<string>;
  includeGitignored: boolean;
};

export type FileSearchWorkspaceOption = {
  key: string;
  /** Short workspace name (basename of the mount path). */
  name: string;
  /**
   * Display label. For a git worktree this is `worktree (rootRepo)`, otherwise
   * the plain workspace name.
   */
  label: string;
  /** Whether this workspace is a git repository or worktree. */
  isGit: boolean;
};

function FolderResultIcon() {
  return (
    <FolderIcon className="size-3.5 shrink-0 text-[oklch(0.72_0.09_78)]" />
  );
}

export function useFileSearchCommandItems(
  query: string,
  filterState: FileSearchFilterState,
  // When true, an empty query lists the most recently changed files instead of
  // returning nothing. Used by the dedicated files mode (not the global view).
  enableRecent: boolean,
): {
  items: FileCommandItem[];
  isLoading: boolean;
  isRecent: boolean;
  workspaceOptions: FileSearchWorkspaceOption[];
} {
  const openAgent = useKartonState((s) => s.browser?.lastOpenAgentId ?? null);
  // `useKartonProcedure` returns a fresh function reference on every render
  // (the selector arrow is new each render), so keep it in a ref and exclude
  // it from the search effect deps. Otherwise the effect re-runs on every
  // render and the debounced search timeout is cleared before it can fire,
  // leaving the UI stuck on "Loading…" forever.
  const searchFiles = useKartonProcedure((p) => p.fileTree.searchFiles);
  const searchFilesRef = useRef(searchFiles);
  searchFilesRef.current = searchFiles;
  const listRecentFiles = useKartonProcedure((p) => p.fileTree.listRecentFiles);
  const listRecentFilesRef = useRef(listRecentFiles);
  listRecentFilesRef.current = listRecentFiles;

  const workspaceMounts = useKartonState(
    useComparingSelector((s) =>
      getFileTreeWorkspaceMountsForAgent(s, openAgent),
    ),
  );

  const workspaceOptions = useMemo<FileSearchWorkspaceOption[]>(
    () =>
      workspaceMounts.map((mount) => {
        const name = getFileTreeWorkspaceName(mount);
        const git = mount.git;
        const rootName =
          git?.isWorktree && git.mainWorktreePath
            ? getBaseName(git.mainWorktreePath)
            : null;
        return {
          key: getFileTreeWorkspaceKey(mount),
          name,
          label: rootName ? `${name} (${rootName})` : name,
          isGit: git !== null,
        };
      }),
    [workspaceMounts],
  );

  // Map workspace key -> human-readable name so result paths show the real
  // folder name instead of the 5-char mount alias. Kept in a ref so it stays
  // out of the search effect deps.
  const workspaceNameByKeyRef = useRef<Map<string, string>>(new Map());
  workspaceNameByKeyRef.current = useMemo(
    () => new Map(workspaceOptions.map((option) => [option.key, option.name])),
    [workspaceOptions],
  );

  // Resolve the workspace keys to actually search. An empty selection means
  // "all workspaces". Derived into a stable string so the search effect only
  // re-runs when the *content* changes, never on unrelated re-renders.
  const searchKey = useMemo(() => {
    const allKeys = workspaceOptions.map((option) => option.key);
    const selected = allKeys.filter((key) =>
      filterState.selectedWorkspaceKeys.has(key),
    );
    const effective = selected.length > 0 ? selected : allKeys;
    return effective.join(KEY_SEPARATOR);
  }, [workspaceOptions, filterState.selectedWorkspaceKeys]);

  const trimmedQuery = query.trim();
  const includeGitignored = filterState.includeGitignored;

  const [resultItems, setResultItems] = useState<FileCommandItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // True while the list is showing recently-changed files (empty query).
  const [isRecent, setIsRecent] = useState(false);
  // Monotonic id used to discard responses from superseded searches.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const workspaceKeys = searchKey ? searchKey.split(KEY_SEPARATOR) : [];

    if (workspaceKeys.length === 0) {
      requestIdRef.current += 1;
      setResultItems([]);
      setIsLoading(false);
      setIsRecent(false);
      return;
    }

    const toFileItem = (result: {
      workspaceKey: string;
      mountPrefix: string;
      relativePath: string;
      fileName: string;
      isDirectory?: boolean;
    }): FileCommandItem => {
      const isDirectory = result.isDirectory ?? false;
      const workspaceName =
        workspaceNameByKeyRef.current.get(result.workspaceKey) ??
        result.mountPrefix;
      return {
        id: `file:${result.workspaceKey}:${result.relativePath}`,
        kind: 'file' as const,
        mode: 'files' as const,
        title: result.fileName,
        subtitle: `${workspaceName}/${result.relativePath}`,
        relativePath: result.relativePath,
        mountPrefix: result.mountPrefix,
        workspaceKey: result.workspaceKey,
        fileName: result.fileName,
        isDirectory,
        icon: isDirectory ? (
          <FolderResultIcon />
        ) : (
          <FileIcon filePath={result.fileName} className="size-4" />
        ),
      };
    };

    const recent = trimmedQuery.length === 0;
    if (recent && !enableRecent) {
      requestIdRef.current += 1;
      setResultItems([]);
      setIsLoading(false);
      setIsRecent(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsRecent(recent);
    setIsLoading(true);

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const results = recent
            ? await listRecentFilesRef.current(
                workspaceKeys,
                includeGitignored,
                RECENT_FILE_LIMIT,
              )
            : await searchFilesRef.current(
                trimmedQuery,
                workspaceKeys,
                includeGitignored,
              );
          if (requestId !== requestIdRef.current) return;
          setResultItems(results.map(toFileItem));
        } catch {
          if (requestId === requestIdRef.current) setResultItems([]);
        } finally {
          if (requestId === requestIdRef.current) setIsLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [trimmedQuery, searchKey, includeGitignored, enableRecent]);

  return { items: resultItems, isLoading, isRecent, workspaceOptions };
}
