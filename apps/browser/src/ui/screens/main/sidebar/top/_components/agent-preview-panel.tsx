import { memo, useEffect, useMemo, useState } from 'react';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { cn } from '@ui/utils';
import { getBaseName, getParentPath } from '@shared/path-utils';
import { FileIcon } from '@ui/components/file-icon';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import {
  IconCodeBranchOutline18,
  IconFolder5Outline18,
} from 'nucleo-ui-outline-18';

// ============================================================================
// Types
// ============================================================================

/** Resolved preview data displayed in the side panel. */
export type PreviewData = {
  title: string;
  messageCount: number;
  createdAt: Date;
  lastMessageAt: Date;
  workspaces: Array<{
    path: string;
    isGitRepo: boolean;
    gitBranch: string | null;
  }>;
  touchedFiles: string[];
};

/** Cached fetched preview. Cache is owned by the parent (`AgentsSelector`)
 * so it survives panel unmount between hovers. */
export type CachedPreview = {
  data: PreviewData;
  fetchedAt: number;
};

/** Live overlay fields read from Karton state for active agents. These drift
 * over the agent's lifetime and should override the (potentially stale) cached
 * values. */
type ActiveOverlay = {
  title: string;
  messageCount: number;
  workspaces: PreviewData['workspaces'];
};

// ============================================================================
// Comparators
// ============================================================================

function workspacesEqual(
  a: PreviewData['workspaces'],
  b: PreviewData['workspaces'],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.path !== y.path ||
      x.isGitRepo !== y.isGitRepo ||
      x.gitBranch !== y.gitBranch
    ) {
      return false;
    }
  }
  return true;
}

function activeOverlayEqual(
  a: ActiveOverlay | null,
  b: ActiveOverlay | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.title === b.title &&
    a.messageCount === b.messageCount &&
    workspacesEqual(a.workspaces, b.workspaces)
  );
}

// ============================================================================
// Component
// ============================================================================

export const AgentPreviewPanel = memo(function AgentPreviewPanel({
  agentId,
  isActive,
  cache,
}: {
  agentId: string;
  isActive: boolean;
  /** Parent-owned preview cache. Survives panel unmount so re-hovers within
   * the same open-dropdown session are instant. */
  cache: Map<string, CachedPreview>;
}) {
  // Live overlay fields from Karton state. Only populated for active agents;
  // null otherwise. These fields are allowed to drift past the cached fetch.
  const activeOverlay = useKartonState(
    useComparingSelector((s): ActiveOverlay | null => {
      if (!isActive) return null;
      const instance = s.agents.instances[agentId];
      if (!instance) return null;
      const toolbox = s.toolbox[agentId];
      return {
        title: instance.state.title,
        messageCount: instance.state.history.length,
        workspaces: (toolbox?.workspace?.mounts ?? []).map((m) => ({
          path: m.path,
          isGitRepo: m.isGitRepo,
          gitBranch: m.gitBranch,
        })),
      };
    }, activeOverlayEqual),
  );

  // Unified fetch path. Both active and history agents call the same RPCs.
  // Diff-history is the source of truth for touched files for both kinds.
  const getStoredInstance = useKartonProcedure(
    (p) => p.agents.getStoredInstance,
  );
  const getTouchedFiles = useKartonProcedure((p) => p.agents.getTouchedFiles);

  const [fetchedPreview, setFetchedPreview] = useState<PreviewData | null>(
    () => cache.get(agentId)?.data ?? null,
  );
  const [isLoading, setIsLoading] = useState(() => !cache.has(agentId));

  useEffect(() => {
    const cached = cache.get(agentId);
    if (cached) {
      setFetchedPreview(cached.data);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setFetchedPreview(null);

    let cancelled = false;

    // `allSettled` so a touched-files failure does not blank out a preview
    // we could otherwise render from the stored instance. Stored instance
    // failure is still fatal — without it there is nothing meaningful to show.
    Promise.allSettled([
      getStoredInstance(agentId),
      getTouchedFiles(agentId),
    ]).then(([storedResult, filesResult]) => {
      if (cancelled) return;

      if (storedResult.status === 'rejected') {
        console.error(
          '[AgentPreviewPanel] Failed to fetch stored instance',
          storedResult.reason,
        );
        setIsLoading(false);
        return;
      }

      const stored = storedResult.value;
      if (!stored) {
        setIsLoading(false);
        return;
      }

      if (filesResult.status === 'rejected') {
        console.error(
          '[AgentPreviewPanel] Failed to fetch touched files',
          filesResult.reason,
        );
      }
      const files = filesResult.status === 'fulfilled' ? filesResult.value : [];

      const data: PreviewData = {
        title: stored.title,
        messageCount: stored.messageCount,
        createdAt: stored.createdAt,
        lastMessageAt: stored.lastMessageAt,
        workspaces: (stored.mountedWorkspaces ?? []).map((w) => ({
          path: w.path,
          isGitRepo: w.isGitRepo,
          gitBranch: w.gitBranch,
        })),
        touchedFiles: files,
      };

      cache.set(agentId, { data, fetchedAt: Date.now() });
      setFetchedPreview(data);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [agentId, cache, getStoredInstance, getTouchedFiles]);

  // Overlay live fields on top of the cached fetch when the agent is active.
  const preview = useMemo<PreviewData | null>(() => {
    if (!fetchedPreview) return null;
    if (!activeOverlay) return fetchedPreview;
    return {
      ...fetchedPreview,
      title: activeOverlay.title,
      messageCount: activeOverlay.messageCount,
      workspaces: activeOverlay.workspaces,
    };
  }, [fetchedPreview, activeOverlay]);

  if (isLoading) {
    return <PreviewSkeleton />;
  }

  if (!preview) {
    return null;
  }

  return <PreviewContent preview={preview} />;
});

// ============================================================================
// Preview Content
// ============================================================================

function PreviewContent({ preview }: { preview: PreviewData }) {
  return (
    <div className="flex w-56 flex-col gap-2 text-xs">
      {/* Title + message count */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 font-semibold text-foreground leading-snug">
          {preview.title}
        </div>
        <span className="shrink-0 whitespace-nowrap text-subtle-foreground leading-snug">
          {preview.messageCount}{' '}
          {preview.messageCount === 1 ? 'message' : 'messages'}
        </span>
      </div>

      {/* Workspaces */}
      {preview.workspaces.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {preview.workspaces.map((w) => (
            <WorkspacePathBadge
              key={w.path}
              path={w.path}
              isGitRepo={w.isGitRepo}
              gitBranch={w.gitBranch}
            />
          ))}
        </div>
      )}

      {/* Edited files */}
      {preview.touchedFiles.length > 0 && (
        <EditedFilesSection files={preview.touchedFiles} />
      )}
    </div>
  );
}

// ============================================================================
// Edited Files Section (scrollable + fade mask)
// ============================================================================

function EditedFilesSection({ files }: { files: string[] }) {
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const viewportRef = useMemo(
    () => ({ current: viewport }),
    [viewport],
  ) as React.RefObject<HTMLElement>;
  const { maskStyle } = useScrollFadeMask(viewportRef, {
    axis: 'vertical',
    fadeDistance: 12,
  });

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-subtle-foreground">
        {files.length} {files.length === 1 ? 'Edit' : 'Edits'}
      </span>
      <OverlayScrollbar
        className="mask-alpha max-h-[134px]"
        style={maskStyle}
        defer={false}
        options={{ overflow: { x: 'hidden', y: 'scroll' } }}
        onViewportRef={setViewport}
      >
        <div className="flex flex-col">
          {files.map((f) => (
            <FilePathRow key={f} path={f} />
          ))}
        </div>
      </OverlayScrollbar>
    </div>
  );
}

// ============================================================================
// Workspace Badge (read-only, visual only)
// ============================================================================

function WorkspacePathBadge({
  path,
  isGitRepo,
  gitBranch,
}: {
  path: string;
  isGitRepo: boolean;
  gitBranch: string | null;
}) {
  const name = getBaseName(path) || path;
  const tooltip = isGitRepo && gitBranch ? `${path} (${gitBranch})` : path;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        'rounded-md border border-derived px-1.5 py-0.5',
        'text-muted-foreground text-xs',
      )}
      title={tooltip}
    >
      {isGitRepo ? (
        <IconCodeBranchOutline18 className="size-3 shrink-0" />
      ) : (
        <IconFolder5Outline18 className="size-3 shrink-0" />
      )}
      <span className="max-w-28 truncate">{name}</span>
    </span>
  );
}

// ============================================================================
// File Path Row (mirrors FileDiffFileItem visual)
// ============================================================================

function FilePathRow({ path }: { path: string }) {
  const fileName = getBaseName(path);
  const dir = getParentPath(path);

  return (
    <div
      className="flex w-full items-center gap-1 rounded px-1 py-0.5"
      title={path}
    >
      <FileIcon filePath={fileName} className="size-4 shrink-0" />
      <span className="min-w-0 truncate text-foreground text-xs leading-none">
        {fileName}
      </span>
      {dir && (
        <span
          className="min-w-0 flex-1 truncate text-subtle-foreground text-xs leading-none"
          dir="rtl"
        >
          <span dir="ltr">{dir}</span>
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function PreviewSkeleton() {
  return (
    <div className="flex w-56 animate-pulse flex-col gap-2">
      <div className="h-3.5 w-3/4 rounded bg-muted-foreground/10" />
      <div className="h-3 w-1/3 rounded bg-muted-foreground/10" />
      <div className="h-5 w-1/2 rounded bg-muted-foreground/10" />
      <div className="flex flex-col gap-1">
        <div className="h-3 w-1/4 rounded bg-muted-foreground/10" />
        <div className="h-4 w-full rounded bg-muted-foreground/10" />
        <div className="h-4 w-5/6 rounded bg-muted-foreground/10" />
      </div>
    </div>
  );
}
