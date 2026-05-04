import { useMemo, type ReactNode } from 'react';
import {
  IconFolder5Outline18,
  IconCodeBranchOutline18,
} from 'nucleo-ui-outline-18';
import { FileIcon } from '@ui/components/file-icon';
import { cn, stripMountPrefix } from '@ui/utils';
import {
  truncateLabel,
  InlineBadge,
  InlineBadgeWrapper,
} from '@ui/screens/main/agent-chat/chat/_components/rich-text/shared';
import { useMountedPaths } from '@ui/hooks/use-mounted-paths';
import { useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { getBaseName } from '@shared/path-utils';

// ─── Path classification ─────────────────────────────────────────────────────

type PathKind = 'workspace-root' | 'folder' | 'file';

function classifyPath(filePath: string): PathKind {
  if (filePath.endsWith('/')) return 'folder';
  const slashIdx = filePath.indexOf('/');
  if (slashIdx < 0) return 'workspace-root';
  return 'file';
}

// ─── Workspace data resolution ───────────────────────────────────────────────

interface WorkspaceData {
  name: string;
  path: string;
  isGitRepo: boolean;
  isMounted: boolean;
}

/**
 * Resolves workspace mount data for a given mount prefix.
 * Resolution priority: live mounts > historical snapshots.
 */
function useWorkspaceData(prefix: string): WorkspaceData | null {
  const historicalMounts = useMountedPaths();
  const [openAgentId] = useOpenAgent();

  const liveMount = useKartonState((s) => {
    if (!openAgentId) return null;
    const mounts = s.toolbox[openAgentId]?.workspace?.mounts;
    if (!mounts) return null;
    return mounts.find((m) => m.prefix === prefix) ?? null;
  });

  return useMemo(() => {
    if (liveMount) {
      return {
        name: getBaseName(liveMount.path) || liveMount.path,
        path: liveMount.path,
        isGitRepo: liveMount.isGitRepo,
        isMounted: true,
      };
    }

    if (historicalMounts) {
      const snapshot = historicalMounts.find((m) => m.prefix === prefix);
      if (snapshot) {
        return {
          name: getBaseName(snapshot.path) || snapshot.path,
          path: snapshot.path,
          isGitRepo: false,
          isMounted: false,
        };
      }
    }

    return null;
  }, [liveMount, historicalMounts, prefix]);
}

// ─── Icon resolution ─────────────────────────────────────────────────────────

function resolveIcon(
  pathKind: PathKind,
  wsData: WorkspaceData | null,
  filePath: string,
  displayFileName: string | undefined,
): ReactNode {
  if (pathKind === 'workspace-root') {
    return wsData?.isGitRepo ? (
      <IconCodeBranchOutline18 className="size-3 shrink-0" />
    ) : (
      <IconFolder5Outline18 className="size-3 shrink-0" />
    );
  }
  if (pathKind === 'folder') {
    return <IconFolder5Outline18 className="size-3 shrink-0" />;
  }
  // Regular file — use seti-based file icon for type-aware coloured icons
  const iconPath = displayFileName || filePath;
  return <FileIcon filePath={iconPath} className="-m-0.5 size-4" />;
}

// ─── Label resolution ────────────────────────────────────────────────────────

function resolveLabel(
  pathKind: PathKind,
  wsData: WorkspaceData | null,
  filePath: string,
  displayFileName: string | undefined,
  lineNumber: string | undefined,
): string {
  if (pathKind === 'workspace-root') {
    const name = wsData?.name ?? filePath;
    return truncateLabel(name, filePath);
  }
  if (pathKind === 'folder') {
    const stripped = stripMountPrefix(filePath);
    const clean = stripped.endsWith('/') ? stripped.slice(0, -1) : stripped;
    const folderName = getBaseName(clean) || clean;
    return truncateLabel(folderName, filePath);
  }
  // Regular file
  const name =
    displayFileName || getBaseName(stripMountPrefix(filePath)) || filePath;
  const label = lineNumber ? `${name}:${lineNumber}` : name;
  return truncateLabel(label, filePath);
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface FileReferenceBadgeProps {
  /**
   * Full path including mount prefix (e.g. `w1/src/index.ts`),
   * just a mount prefix for workspace roots (e.g. `w1`),
   * or a trailing-slash path for folders (e.g. `w1/src/`).
   */
  filePath: string;
  /** Optional line number for display */
  lineNumber?: string;
  /**
   * Display filename override. Used when the path doesn't reflect the real
   * filename (e.g. att/ blob keys resolved to their original name).
   */
  displayFileName?: string;
  /**
   * When true, renders the badge without `InlineBadgeWrapper` (no tooltip,
   * no NodeViewWrapper). Use for streamdown badges that are wrapped externally
   * (e.g. by `WorkspaceFileClickWrapper`).
   * @default false
   */
  bare?: boolean;
  /** Whether in view-only mode (no delete button). Only used when bare=false. */
  viewOnly?: boolean;
  /** Whether the badge is selected in the editor. */
  selected?: boolean;
  /** Whether the editor is in editable mode. */
  isEditable?: boolean;
  /** Callback when the delete button is clicked. */
  onDelete?: () => void;
  /** Additional className applied to InlineBadge. */
  className?: string;
  /** Tooltip content override. Only used when bare=false. */
  tooltipContent?: ReactNode;
}

/**
 * Unified badge component for file, folder, and workspace-root references.
 *
 * Resolves the correct icon and label based on the path:
 * - **Workspace root** (no `/`): folder or git-branch icon + workspace name
 * - **Folder** (trailing `/`): folder icon + folder name
 * - **File**: seti-based coloured file-type icon + filename
 *
 * Two rendering modes:
 * - `bare=true`: raw badge for external wrapping (streamdown with
 *   `WorkspaceFileClickWrapper`).
 * - `bare=false` (default): wrapped with `InlineBadgeWrapper` for tooltip
 *   and optional `NodeViewWrapper` (chat input).
 */
export function FileReferenceBadge({
  filePath,
  lineNumber,
  displayFileName,
  bare = false,
  viewOnly = true,
  selected = false,
  isEditable = false,
  onDelete,
  className,
  tooltipContent: tooltipContentOverride,
}: FileReferenceBadgeProps) {
  const pathKind = useMemo(() => classifyPath(filePath), [filePath]);

  // Extract mount prefix for workspace data lookup
  const mountPrefix = useMemo(() => {
    const slashIdx = filePath.indexOf('/');
    return slashIdx > 0 ? filePath.slice(0, slashIdx) : filePath;
  }, [filePath]);

  const wsData = useWorkspaceData(mountPrefix);

  const icon = useMemo(
    () => resolveIcon(pathKind, wsData, filePath, displayFileName),
    [pathKind, wsData, filePath, displayFileName],
  );

  const displayLabel = useMemo(
    () => resolveLabel(pathKind, wsData, filePath, displayFileName, lineNumber),
    [pathKind, wsData, filePath, displayFileName, lineNumber],
  );

  const tooltipContent = useMemo(() => {
    if (tooltipContentOverride) return tooltipContentOverride;
    if (pathKind === 'workspace-root') {
      return wsData?.path ?? filePath;
    }
    const stripped = stripMountPrefix(filePath);
    return lineNumber ? `${stripped}:${lineNumber}` : stripped;
  }, [tooltipContentOverride, pathKind, wsData, filePath, lineNumber]);

  const badgeClassName = cn(
    pathKind === 'workspace-root' &&
      wsData &&
      !wsData.isMounted &&
      'opacity-70',
    className,
  );

  const badge = (
    <InlineBadge
      icon={icon}
      label={displayLabel}
      selected={selected}
      isEditable={isEditable}
      onDelete={onDelete ?? (() => {})}
      className={badgeClassName}
    />
  );

  if (bare) {
    return <span className="inline shrink-0 px-0.5 pt-px">{badge}</span>;
  }

  return (
    <InlineBadgeWrapper viewOnly={viewOnly} tooltipContent={tooltipContent}>
      {badge}
    </InlineBadgeWrapper>
  );
}
