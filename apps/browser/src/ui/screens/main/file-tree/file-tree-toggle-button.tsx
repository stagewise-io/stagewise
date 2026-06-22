import { useEffect, useRef, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { FolderIcon, FolderTreeIcon } from 'lucide-react';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import { HotkeyActions } from '@shared/hotkeys';
import {
  areFileTreeWorkspaceMountsEqual,
  getFileTreeWorkspaceKey,
  getFileTreeWorkspaceMountsForAgent,
} from './file-tree-utils';
import { formatDiffCount } from './format-diff-count';

// Cache diff totals per workspace across mount/unmount cycles to
// prevent flicker when the toggle button moves between containers.
const diffTotalsCache = new Map<string, { added: number; deleted: number }>();

export function FileTreeToggleButton() {
  const visible = useKartonState((s) => s.fileTree.visible);
  const setVisible = useKartonProcedure((p) => p.fileTree.setVisible);
  const [openAgent] = useOpenAgent();
  const getWorkspaceDiffSummary = useKartonProcedure(
    (p) => p.toolbox.getWorkspaceDiffSummary,
  );
  const label = visible ? 'Hide file tree' : 'Show file tree';
  const Icon = visible ? FolderTreeIcon : FolderIcon;

  // Resolve selected workspace path (same logic as sidebar)
  const workspaceMounts = useKartonState(
    useComparingSelector(
      (s) => getFileTreeWorkspaceMountsForAgent(s, openAgent),
      areFileTreeWorkspaceMountsEqual,
    ),
  );
  const activeWorkspaceKey = useKartonState(
    (s) => s.fileTree.activeWorkspaceKey,
  );

  // Derive the effective workspace key with fallback — same logic as the
  // sidebar. When the sidebar is collapsed, activeWorkspaceKey can be stale
  // or null, but we still need to track revisions for the fallback workspace.
  const selectedWorkspaceKey = workspaceMounts.some(
    (m) => getFileTreeWorkspaceKey(m) === activeWorkspaceKey,
  )
    ? activeWorkspaceKey
    : workspaceMounts[0]
      ? getFileTreeWorkspaceKey(workspaceMounts[0])
      : null;

  const selectedWorkspacePath = selectedWorkspaceKey
    ? (workspaceMounts.find(
        (m) => getFileTreeWorkspaceKey(m) === selectedWorkspaceKey,
      )?.path ?? null)
    : null;

  // Re-fetch diff totals when the workspace files change.
  const workspaceRevision = useKartonState((s) =>
    selectedWorkspaceKey
      ? (s.fileTree.workspaceRevisions[selectedWorkspaceKey] ?? 0)
      : 0,
  );

  const [diffTotals, setDiffTotals] = useState(() => {
    if (!selectedWorkspacePath) return { added: 0, deleted: 0 };
    return (
      diffTotalsCache.get(selectedWorkspacePath) ?? {
        added: 0,
        deleted: 0,
      }
    );
  });

  // Use a ref for the procedure to keep it out of the effect deps.
  // useKartonProcedure takes an inline selector (new function identity each
  // render), so even though the underlying proxy is cached, the useMemo
  // inside the hook recomputes. Including the result in deps is fragile —
  // a ref avoids the issue entirely, matching the sidebar's pattern.
  const getWorkspaceDiffSummaryRef = useRef(getWorkspaceDiffSummary);
  getWorkspaceDiffSummaryRef.current = getWorkspaceDiffSummary;

  useEffect(() => {
    if (visible || !selectedWorkspacePath) {
      setDiffTotals({ added: 0, deleted: 0 });
      return;
    }
    const workspacePath = selectedWorkspacePath;
    let cancelled = false;
    getWorkspaceDiffSummaryRef
      .current(workspacePath)
      .then((result) => {
        if (cancelled) return;
        const totals = result
          ? { added: result.totalAdded, deleted: result.totalDeleted }
          : { added: 0, deleted: 0 };
        diffTotalsCache.set(workspacePath, totals);
        setDiffTotals(totals);
      })
      .catch(() => {
        if (!cancelled) setDiffTotals({ added: 0, deleted: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [visible, selectedWorkspacePath, workspaceRevision]);

  const showDiff = !visible && (diffTotals.added > 0 || diffTotals.deleted > 0);

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant="ghost"
          size={showDiff ? 'sm' : 'icon-sm'}
          aria-label={label}
          onClick={() => setVisible(!visible)}
          className={showDiff ? 'gap-1 rounded-full px-2' : undefined}
        >
          <Icon className="size-4 shrink-0" />
          {showDiff && (
            <span className="flex min-w-0 shrink-0 flex-col font-mono text-[0.5rem] tabular-nums leading-none">
              <span className="text-success-foreground">
                +{formatDiffCount(diffTotals.added)}
              </span>
              <span className="text-error-foreground">
                -{formatDiffCount(diffTotals.deleted)}
              </span>
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex items-center gap-1.5">
          <span>{label}</span>
          <HotkeyCombo action={HotkeyActions.TOGGLE_FILE_TREE} size="xs" />
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
