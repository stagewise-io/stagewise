import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import {
  getFileTreeWorkspaceKey,
  getFileTreeWorkspaceMountsForAgent,
  getFileTreeWorkspaceName,
} from '@ui/screens/main/file-tree/file-tree-utils';
import type { FileCommandItem } from '../command-center-model';

const SEARCH_DEBOUNCE_MS = 150;
const KEY_SEPARATOR = '\u0000';

export type FileSearchFilterState = {
  selectedWorkspaceKeys: Set<string>;
  includeGitignored: boolean;
};

export type FileSearchWorkspaceOption = { key: string; name: string };

export function useFileSearchCommandItems(
  query: string,
  filterState: FileSearchFilterState,
): {
  items: FileCommandItem[];
  isLoading: boolean;
  workspaceOptions: FileSearchWorkspaceOption[];
} {
  const openAgent = useKartonState((s) => s.browser?.lastOpenAgentId ?? null);
  const searchFiles = useKartonProcedure((p) => p.fileTree.searchFiles);

  const workspaceMounts = useKartonState(
    useComparingSelector((s) =>
      getFileTreeWorkspaceMountsForAgent(s, openAgent),
    ),
  );

  const workspaceOptions = useMemo<FileSearchWorkspaceOption[]>(
    () =>
      workspaceMounts.map((mount) => ({
        key: getFileTreeWorkspaceKey(mount),
        name: getFileTreeWorkspaceName(mount),
      })),
    [workspaceMounts],
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
  // Monotonic id used to discard responses from superseded searches.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const workspaceKeys = searchKey ? searchKey.split(KEY_SEPARATOR) : [];

    if (!trimmedQuery || workspaceKeys.length === 0) {
      requestIdRef.current += 1;
      setResultItems([]);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const results = await searchFiles(
            trimmedQuery,
            workspaceKeys,
            includeGitignored,
          );
          if (requestId !== requestIdRef.current) return;
          setResultItems(
            results.map((result) => ({
              id: `file:${result.workspaceKey}:${result.relativePath}`,
              kind: 'file' as const,
              mode: 'files' as const,
              title: result.fileName,
              subtitle: `${result.mountPrefix}/${result.relativePath}`,
              relativePath: result.relativePath,
              mountPrefix: result.mountPrefix,
              workspaceKey: result.workspaceKey,
              fileName: result.fileName,
            })),
          );
        } catch {
          if (requestId === requestIdRef.current) setResultItems([]);
        } finally {
          if (requestId === requestIdRef.current) setIsLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [trimmedQuery, searchKey, includeGitignored, searchFiles]);

  return { items: resultItems, isLoading, workspaceOptions };
}
