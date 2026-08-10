import { Virtuoso } from 'react-virtuoso';
import { cn } from '@ui/utils';
import { getBaseName } from '@shared/path-utils';
import type {
  MountedWorkspaceGitDiffEntry,
  MountedWorkspaceGitDiffSummary,
} from '@shared/karton-contracts/ui';
import { DiffLineStats } from '@ui/components/diff-line-stats';

type DiffRow = MountedWorkspaceGitDiffEntry;

const CHANGE_LABELS: Record<DiffRow['changeType'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
};

const CHANGE_COLORS: Record<DiffRow['changeType'], string> = {
  modified: 'text-primary-foreground',
  added: 'text-success-foreground',
  deleted: 'text-error-foreground',
  renamed: 'text-warning-foreground',
  untracked: 'text-success-foreground',
};

function DiffRowItem({
  row,
  selected,
  onClick,
}: {
  row: DiffRow;
  selected: boolean;
  onClick: (row: DiffRow) => void;
}) {
  const label = CHANGE_LABELS[row.changeType];
  const colorClass = CHANGE_COLORS[row.changeType];
  const fileName = getBaseName(row.path);
  const dirPath =
    row.path === fileName
      ? ''
      : row.path.slice(0, -fileName.length).replace(/\/$/, '');

  return (
    <div className={cn('mx-1 mb-px rounded', selected && 'bg-active-derived')}>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-2 py-1',
          'border-derived-weak/40 border-b text-left text-xs transition-colors duration-75 last:border-b-0',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-solid focus-visible:ring-inset',
          selected ? 'hover:bg-foreground/[0.06]' : 'hover:bg-hover-derived',
        )}
        onClick={() => onClick(row)}
        title={row.oldPath ? `${row.oldPath} → ${row.path}` : row.path}
      >
        <span
          className={cn(
            'inline-flex w-4 shrink-0 items-center justify-center',
            'font-mono font-semibold text-[11px] leading-none',
            colorClass,
          )}
        >
          {label}
        </span>
        {row.staged && (
          <span className="shrink-0 rounded bg-surface-2 px-1 font-medium text-[9px] text-muted-foreground leading-none">
            S
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-foreground">
          <span>{fileName}</span>
          {dirPath && (
            <span className="ml-1.5 text-subtle-foreground">{dirPath}</span>
          )}
          {row.oldPath && (
            <span className="ml-1 text-[10px] text-muted-foreground">
              ← {getBaseName(row.oldPath)}
            </span>
          )}
        </span>
        <DiffLineStats added={row.added} removed={row.deleted} />
      </button>
    </div>
  );
}

export function FileTreeDiffView({
  workspaceKey,
  data,
  loading,
  shownRelativePath,
  onOpenFile,
}: {
  workspaceKey: string | null;
  data: MountedWorkspaceGitDiffSummary | null;
  loading: boolean;
  shownRelativePath: string | null;
  onOpenFile: (path: string, staged: boolean, oldPath?: string) => void;
}) {
  const rows: DiffRow[] = data?.entries ?? [];

  function handleRowClick(row: DiffRow) {
    if (!workspaceKey || row.changeType === 'deleted') return;
    // Renamed files keep their committed (HEAD) blob at the old path, so the
    // diff view needs it to load the original side.
    onOpenFile(row.path, row.staged, row.oldPath);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-muted-foreground text-xs">
        Loading diff…
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-muted-foreground text-xs">
        Not a git repository
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-muted-foreground text-xs">
        Working tree clean
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <Virtuoso
        totalCount={rows.length}
        itemContent={(index) => {
          const row = rows[index]!;
          return (
            <DiffRowItem
              row={row}
              selected={row.path === shownRelativePath}
              onClick={handleRowClick}
            />
          );
        }}
        computeItemKey={(index) => {
          const row = rows[index];
          return row ? `${row.staged ? 's:' : ''}${row.path}` : index;
        }}
        increaseViewportBy={200}
      />
    </div>
  );
}
