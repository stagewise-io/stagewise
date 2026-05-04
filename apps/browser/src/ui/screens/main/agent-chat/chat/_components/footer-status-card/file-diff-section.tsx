import { useMemo } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import type { FileDiff } from '@shared/karton-contracts/ui/shared-types';
import { ChevronDownIcon } from 'lucide-react';
import { FileIcon } from '@ui/components/file-icon';
import { cn } from '@ui/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { getBaseName, getParentPath, normalizePath } from '@shared/path-utils';
import { useFileIDEHref } from '@ui/hooks/use-file-ide-href';
import { FileContextMenu } from '@ui/components/file-context-menu';
import type { Mount } from '@shared/karton-contracts/ui/agent/metadata';
import {
  type StatusCardSection,
  type FormattedFileDiff,
  getLineStats,
  getHunkIds,
  hasRealChanges,
} from './shared';

export interface FileDiffSectionProps {
  pendingDiffs: FormattedFileDiff[];
  diffSummary: FormattedFileDiff[];
  /** All mounts ever seen (resolved from env snapshots). */
  resolvedMounts: Mount[];
  /** Paths of currently connected mounts. */
  activeMountPaths: Set<string>;
  onRejectAll: (hunkIds: string[]) => void;
  onAcceptAll: (hunkIds: string[]) => void;
  onOpenDiffReview: (fileId: string) => void;
}

export function formatFileDiff(fileDiff: FileDiff): FormattedFileDiff {
  return {
    ...fileDiff,
    fileName: getBaseName(fileDiff.path),
  };
}

/**
 * Derive the parent directory path relative to its workspace mount.
 * Returns the directory portion only (no filename), or empty string
 * when the file sits at the workspace root.
 */
function getRelativeDir(absoluteFilePath: string, mounts: Mount[]): string {
  const normalized = normalizePath(absoluteFilePath);
  const parentDir = getParentPath(normalized);
  for (const mount of mounts) {
    const mountRoot = normalizePath(mount.path);
    if (parentDir.startsWith(`${mountRoot}/`)) {
      return parentDir.slice(mountRoot.length + 1);
    }
    if (parentDir === mountRoot) return '';
  }
  // Fallback: just show parent dir as-is
  return parentDir;
}

/**
 * Group diffs by their workspace mount path.
 * Returns groups in mount order, each with the mount's basename as label.
 */
function groupDiffsByMount(
  diffs: FormattedFileDiff[],
  mounts: Mount[],
  activeMountPaths: Set<string>,
): {
  label: string;
  mountPath: string;
  isDisconnected: boolean;
  diffs: FormattedFileDiff[];
}[] {
  const groups = new Map<
    string,
    { label: string; isDisconnected: boolean; diffs: FormattedFileDiff[] }
  >();

  // Pre-create groups in mount order
  for (const mount of mounts) {
    groups.set(mount.path, {
      label: getBaseName(mount.path) || mount.path,
      isDisconnected: !activeMountPaths.has(mount.path),
      diffs: [],
    });
  }

  for (const diff of diffs) {
    const normalized = normalizePath(diff.path);
    let matched = false;
    for (const mount of mounts) {
      const mountRoot = normalizePath(mount.path);
      if (normalized.startsWith(`${mountRoot}/`) || normalized === mountRoot) {
        groups.get(mount.path)!.diffs.push(diff);
        matched = true;
        break;
      }
    }
    // Fallback: assign to first mount if no match
    if (!matched && mounts.length > 0) {
      const firstMount = mounts[0];
      if (firstMount) {
        groups.get(firstMount.path)?.diffs.push(diff);
      }
    }
  }

  return Array.from(groups.entries())
    .filter(([, g]) => g.diffs.length > 0)
    .map(([mountPath, g]) => ({ ...g, mountPath }));
}

export function FileDiffFileItem({
  fileDiff,
  resolvedMounts,
  onOpenDiffReview,
}: {
  fileDiff: FormattedFileDiff;
  resolvedMounts: Mount[];
  onOpenDiffReview: (fileId: string) => void;
}) {
  const { added, removed } = getLineStats(fileDiff);
  const { resolvePath, toRelativePath } = useFileIDEHref();
  const displayPath = toRelativePath(fileDiff.path) ?? fileDiff.path;
  const relativeDir = useMemo(
    () => getRelativeDir(fileDiff.path, resolvedMounts),
    [fileDiff.path, resolvedMounts],
  );

  return (
    <FileContextMenu relativePath={fileDiff.path} resolvePath={resolvePath}>
      <Tooltip>
        <TooltipTrigger>
          <button
            type="button"
            className="flex w-full cursor-pointer flex-row items-center justify-start gap-1 rounded px-1 py-0.5 pr-2 text-foreground hover:bg-surface-1 hover:text-hover-derived"
            onClick={() => onOpenDiffReview(fileDiff.fileId)}
          >
            <FileIcon
              filePath={fileDiff.fileName}
              className="size-5 shrink-0"
            />
            <span className="shrink-0 text-xs leading-none">
              {fileDiff.fileName}
            </span>
            {relativeDir && (
              <span
                className="min-w-0 shrink truncate text-subtle-foreground text-xs leading-none"
                dir="rtl"
              >
                <span dir="ltr">{relativeDir}</span>
              </span>
            )}
            {fileDiff.isExternal ? (
              <>
                {fileDiff.changeType === 'created' && (
                  <span className="ml-auto shrink-0 text-[10px] text-success-foreground leading-none">
                    (new)
                  </span>
                )}
                {fileDiff.changeType === 'deleted' && (
                  <span className="ml-auto shrink-0 text-[10px] text-error-foreground leading-none">
                    (deleted)
                  </span>
                )}
                {fileDiff.changeType === 'modified' && (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground leading-none">
                    (binary)
                  </span>
                )}
              </>
            ) : (
              <span className="ml-auto flex shrink-0 flex-row items-center gap-0.5 pl-2">
                {added > 0 && (
                  <span className="text-[10px] text-success-foreground leading-none hover:text-hover-derived">
                    +{added}
                  </span>
                )}
                {removed > 0 && (
                  <span className="text-[10px] text-error-foreground leading-none hover:text-hover-derived">
                    -{removed}
                  </span>
                )}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{displayPath}</TooltipContent>
      </Tooltip>
    </FileContextMenu>
  );
}

function FileDiffList({
  diffs,
  resolvedMounts,
  activeMountPaths,
  onOpenDiffReview,
}: {
  diffs: FormattedFileDiff[];
  resolvedMounts: Mount[];
  activeMountPaths: Set<string>;
  onOpenDiffReview: (fileId: string) => void;
}) {
  const groups = useMemo(
    () => groupDiffsByMount(diffs, resolvedMounts, activeMountPaths),
    [diffs, resolvedMounts, activeMountPaths],
  );

  // Show group labels when the agent ever had more than one workspace connected
  const hideLabels = resolvedMounts.length <= 1;

  if (groups.length === 0) return null;

  if (hideLabels) {
    return (
      <div className="pt-1">
        {groups[0]?.diffs.map((edit) => (
          <FileDiffFileItem
            key={edit.path}
            fileDiff={edit}
            resolvedMounts={resolvedMounts}
            onOpenDiffReview={onOpenDiffReview}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="pt-1">
      {groups.map((group) => (
        <div key={group.mountPath}>
          <div className="shrink-0 px-2 pt-1 pb-1 font-normal text-subtle-foreground text-xs">
            {group.label}
            {group.isDisconnected && (
              <span className="ml-1 text-subtle-foreground opacity-60">
                (disconnected)
              </span>
            )}
          </div>
          {group.diffs.map((edit) => (
            <FileDiffFileItem
              key={edit.path}
              fileDiff={edit}
              resolvedMounts={resolvedMounts}
              onOpenDiffReview={onOpenDiffReview}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function FileDiffSection(
  props: FileDiffSectionProps,
): StatusCardSection | null {
  const {
    pendingDiffs,
    diffSummary,
    resolvedMounts,
    activeMountPaths,
    onRejectAll,
    onAcceptAll,
    onOpenDiffReview,
  } = props;

  // Filter out noops from summary (rejected edits with no actual changes)
  const filteredSummary = diffSummary.filter(hasRealChanges);

  if (pendingDiffs?.length === 0 && filteredSummary.length === 0) return null;

  const hasPendingDiffs = pendingDiffs?.length > 0;

  return {
    // Change key when transitioning from pending to summary - forces remount with new defaultOpen
    key: hasPendingDiffs ? 'file-diff-pending' : 'file-diff-summary',
    // Expand when there are pending diffs to review, collapse for summary view
    defaultOpen: hasPendingDiffs,
    trigger: (isOpen: boolean) => (
      <div className="flex w-full flex-row items-center justify-between gap-2 pl-1.5 text-muted-foreground text-xs hover:text-foreground has-[button:hover]:text-muted-foreground">
        <ChevronDownIcon
          className={cn(
            'size-3 shrink-0 transition-transform duration-50',
            isOpen && 'rotate-180',
          )}
        />
        {pendingDiffs?.length > 0 ? (
          `${pendingDiffs.length} Edit${pendingDiffs.length > 1 ? 's' : ''}`
        ) : (
          <span>
            {filteredSummary.length} Edit
            {filteredSummary.length > 1 ? 's' : ''}
          </span>
        )}

        {pendingDiffs?.length > 0 ? (
          <div className="ml-auto flex flex-row items-center justify-start gap-1">
            <Button
              variant="ghost"
              size="xs"
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onRejectAll(
                  pendingDiffs?.flatMap((diff) => getHunkIds(diff)) ?? [],
                );
              }}
            >
              Reject
            </Button>
            <Button
              variant="primary"
              size="xs"
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onAcceptAll(
                  pendingDiffs?.flatMap((diff) => getHunkIds(diff)) ?? [],
                );
              }}
            >
              Accept all
            </Button>
          </div>
        ) : (
          <div className="ml-auto h-6" />
        )}
      </div>
    ),
    scrollable: true,
    contentClassName: 'px-0',
    content:
      pendingDiffs?.length > 0 ? (
        <FileDiffList
          diffs={pendingDiffs}
          resolvedMounts={resolvedMounts}
          activeMountPaths={activeMountPaths}
          onOpenDiffReview={onOpenDiffReview}
        />
      ) : filteredSummary.length > 0 ? (
        <FileDiffList
          diffs={filteredSummary}
          resolvedMounts={resolvedMounts}
          activeMountPaths={activeMountPaths}
          onOpenDiffReview={onOpenDiffReview}
        />
      ) : null,
  };
}
