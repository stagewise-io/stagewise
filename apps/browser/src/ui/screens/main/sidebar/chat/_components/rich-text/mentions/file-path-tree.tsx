import { IconFolder5Outline18 } from 'nucleo-ui-outline-18';
import { FileIcon } from '@ui/components/file-icon';

interface FilePathTreeProps {
  workspaceName: string;
  relativePath: string;
  fileName: string;
}

/** Max individually rendered directory segments (from the end). */
const MAX_TAIL_DIRS = 2;

/**
 * Threshold: if total dir segments exceed this, the leading ones
 * are collapsed into a single truncated `/`-joined row.
 */
const COLLAPSE_THRESHOLD = 3;

export function FilePathTree({
  workspaceName,
  relativePath,
  fileName,
}: FilePathTreeProps) {
  const parts = relativePath.split('/').filter(Boolean);
  const dirSegments = parts.slice(0, -1);

  const shouldCollapse = dirSegments.length > COLLAPSE_THRESHOLD;

  // When collapsing: first row = joined head, then last MAX_TAIL_DIRS individually
  const collapsedHead = shouldCollapse
    ? dirSegments.slice(0, -MAX_TAIL_DIRS).join('/')
    : null;
  const visibleDirs = shouldCollapse
    ? dirSegments.slice(-MAX_TAIL_DIRS)
    : dirSegments;

  // Indentation offset: collapsed head takes depth 1, visible dirs follow after
  const baseDepth = collapsedHead ? 1 : 0;

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {/* Workspace name */}
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <IconFolder5Outline18 className="size-3 shrink-0 text-foreground" />
        <span className="truncate">{workspaceName}</span>
      </div>

      {/* Collapsed leading dirs */}
      {collapsedHead && (
        <div
          className="flex items-center gap-1.5 text-muted-foreground"
          style={{ paddingLeft: '12px' }}
        >
          <IconFolder5Outline18 className="size-3 shrink-0" />
          <span className="truncate">{collapsedHead}</span>
        </div>
      )}

      {/* Individually visible dirs */}
      {visibleDirs.map((segment, idx) => (
        <div
          key={visibleDirs.slice(0, idx + 1).join('/')}
          className="flex items-center gap-1.5 text-muted-foreground"
          style={{ paddingLeft: `${(baseDepth + idx + 1) * 12}px` }}
        >
          <IconFolder5Outline18 className="size-3 shrink-0" />
          <span className="truncate">{segment}</span>
        </div>
      ))}

      {/* File leaf */}
      <div
        className="flex items-center gap-1.5 font-medium text-foreground"
        style={{
          paddingLeft: `${(baseDepth + visibleDirs.length + 1) * 12}px`,
        }}
      >
        <FileIcon filePath={fileName} className="-m-0.5 size-4 shrink-0" />
        <span className="truncate">{fileName}</span>
      </div>
    </div>
  );
}
