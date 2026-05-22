import { useMemo, useRef } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { XIcon } from 'lucide-react';
import { IconTrash2Outline24 } from 'nucleo-core-outline-24';
import { IconBranchOutOutline18 } from 'nucleo-ui-outline-18';

function getBaseName(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}

function formatLastUsedAge(lastUsedAt: number | null): string {
  if (lastUsedAt === null) return 'never';
  const days = Math.max(
    1,
    Math.floor((Date.now() - lastUsedAt) / (24 * 60 * 60 * 1000)),
  );
  return `${days}d`;
}

export function WorktreeCleanupBadge() {
  const cleanup = useKartonState((s) => s.workspaceGitCleanup);
  const dismissCleanup = useKartonProcedure(
    (p) => p.toolbox.dismissWorkspaceGitCleanupPrompt,
  );
  const cleanWorktrees = useKartonProcedure(
    (p) => p.toolbox.cleanWorkspaceGitWorktrees,
  );

  const candidatePaths = useMemo(
    () => cleanup.candidates.map((candidate) => candidate.path),
    [cleanup.candidates],
  );
  const listScrollRef = useRef<HTMLDivElement>(null);
  const { maskStyle: listMaskStyle } = useScrollFadeMask(listScrollRef, {
    axis: 'vertical',
    fadeDistance: 16,
  });

  if (cleanup.dismissed || cleanup.candidates.length === 0) return null;

  const count = cleanup.candidates.length;
  const failedCount = cleanup.lastResult?.failed.length ?? 0;

  const handleDismiss = () => {
    void dismissCleanup();
  };

  const handleClean = () => {
    void cleanWorktrees(candidatePaths);
  };

  return (
    <div className="relative flex shrink-0 flex-col gap-2 rounded-md bg-background/60 p-2.5 shadow-elevation-1 ring-1 ring-derived-strong backdrop-blur-xl dark:bg-surface-1/60">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <IconTrash2Outline24 className="size-3.5 shrink-0 text-foreground" />
          <div className="mt-0.5 min-w-0 flex-1 font-medium text-foreground text-xs">
            Clean old worktrees?
          </div>
          <Button
            variant="ghost"
            size="icon-2xs"
            className="ml-auto shrink-0"
            aria-label="Dismiss worktree cleanup"
            onClick={handleDismiss}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
        <p className="text-muted-foreground text-xs leading-snug">
          {count} clean, inactive{' '}
          {count === 1 ? 'worktree is' : 'worktrees are'} already merged and can
          be removed safely.
        </p>
      </div>

      <div
        ref={listScrollRef}
        className="mask-alpha scrollbar-subtle flex max-h-44 flex-col gap-1 overflow-y-auto py-1"
        style={listMaskStyle}
      >
        {cleanup.candidates.map((candidate) => (
          <div
            key={candidate.path}
            className="shrink-0 rounded-md bg-surface-1 px-2 py-1.5 ring-1 ring-border-subtle"
          >
            <div className="flex min-w-0 items-center gap-1.5 text-xs">
              <IconBranchOutOutline18 className="size-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate font-medium text-foreground">
                {candidate.branch ?? getBaseName(candidate.path)}
              </span>
              <span className="shrink-0 text-subtle-foreground">
                merged into {candidate.mergedInto}
              </span>
              <span className="ml-auto shrink-0 text-subtle-foreground">
                {formatLastUsedAge(candidate.lastUsedAt)}
              </span>
            </div>
            <div
              className="mt-0.5 truncate text-[0.68rem] text-subtle-foreground"
              title={candidate.path}
            >
              {candidate.path}
            </div>
          </div>
        ))}
      </div>

      {failedCount > 0 && (
        <div className="py-1 text-error-foreground text-xs">
          {cleanup.lastResult?.failed[0]?.message ?? 'Cleanup failed.'}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="xs"
          disabled={cleanup.cleaning}
          onClick={handleDismiss}
        >
          Don&apos;t Clean
        </Button>
        <Button
          variant="primary"
          size="xs"
          disabled={cleanup.cleaning}
          onClick={handleClean}
        >
          {cleanup.cleaning ? 'Cleaning…' : 'Clean worktrees'}
        </Button>
      </div>
    </div>
  );
}
