import { useCallback } from 'react';
import { cn } from '@ui/utils';
import type {
  FileSearchFilterState,
  FileSearchWorkspaceOption,
} from '../sources/use-file-command-items';

export function CommandCenterFileFilter({
  workspaceOptions,
  filterState,
  onFilterChange,
}: {
  workspaceOptions: FileSearchWorkspaceOption[];
  filterState: FileSearchFilterState;
  onFilterChange: (state: FileSearchFilterState) => void;
}) {
  // An empty selection means "all workspaces". Toggling collapses back to the
  // empty set once every workspace is selected, keeping a single source of
  // truth for the "all" state.
  const { selectedWorkspaceKeys } = filterState;
  const isAllSelected = selectedWorkspaceKeys.size === 0;

  const toggleWorkspace = useCallback(
    (key: string) => {
      let next: Set<string>;
      if (isAllSelected) {
        // Narrow from "all" down to just the clicked workspace.
        next = new Set([key]);
      } else {
        next = new Set(selectedWorkspaceKeys);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }
      // Selecting everything (or nothing) is equivalent to "all".
      if (next.size === 0 || next.size === workspaceOptions.length) {
        next = new Set();
      }
      onFilterChange({ ...filterState, selectedWorkspaceKeys: next });
    },
    [
      filterState,
      isAllSelected,
      onFilterChange,
      selectedWorkspaceKeys,
      workspaceOptions.length,
    ],
  );

  const toggleGitignored = useCallback(() => {
    onFilterChange({
      ...filterState,
      includeGitignored: !filterState.includeGitignored,
    });
  }, [filterState, onFilterChange]);

  if (workspaceOptions.length <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-border-subtle border-b px-3 py-1.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {workspaceOptions.map((workspace) => {
          const selected =
            isAllSelected || selectedWorkspaceKeys.has(workspace.key);
          return (
            <button
              key={workspace.key}
              type="button"
              onClick={() => toggleWorkspace(workspace.key)}
              className={cn(
                'cursor-default rounded-md px-1.5 py-0.5 text-xs transition-colors duration-150 ease-out',
                selected
                  ? 'bg-primary-solid/20 text-foreground'
                  : 'bg-surface-1 text-subtle-foreground hover:text-foreground',
              )}
            >
              {workspace.name}
            </button>
          );
        })}
      </div>
      <label className="flex shrink-0 cursor-default items-center gap-1.5 text-subtle-foreground text-xs">
        <input
          type="checkbox"
          checked={filterState.includeGitignored}
          onChange={toggleGitignored}
          className="size-3 cursor-default accent-foreground"
        />
        <span>Include gitignored</span>
      </label>
    </div>
  );
}
