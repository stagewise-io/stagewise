import { useEffect, useState } from 'react';
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
  getFileTreeWorkspaceKey,
  getFileTreeWorkspaceMountsForAgent,
} from './file-tree-utils';

function areMountsEqual(
  a: ReturnType<typeof getFileTreeWorkspaceMountsForAgent>,
  b: ReturnType<typeof getFileTreeWorkspaceMountsForAgent>,
): boolean {
  return (
    a.length === b.length &&
    a.every((mount, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        getFileTreeWorkspaceKey(mount) === getFileTreeWorkspaceKey(other)
      );
    })
  );
}

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
      areMountsEqual,
    ),
  );
  const activeWorkspaceKey = useKartonState(
    (s) => s.fileTree.activeWorkspaceKey,
  );
  const selectedWorkspacePath =
    workspaceMounts.find(
      (m) => getFileTreeWorkspaceKey(m) === activeWorkspaceKey,
    )?.path ??
    workspaceMounts[0]?.path ??
    null;

  const [diffTotals, setDiffTotals] = useState({ added: 0, deleted: 0 });

  useEffect(() => {
    if (visible || !selectedWorkspacePath) {
      setDiffTotals({ added: 0, deleted: 0 });
      return;
    }
    let cancelled = false;
    getWorkspaceDiffSummary(selectedWorkspacePath)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setDiffTotals({
            added: result.totalAdded,
            deleted: result.totalDeleted,
          });
        } else {
          setDiffTotals({ added: 0, deleted: 0 });
        }
      })
      .catch(() => {
        if (!cancelled) setDiffTotals({ added: 0, deleted: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [visible, selectedWorkspacePath, getWorkspaceDiffSummary]);

  const showDiff = !visible && (diffTotals.added > 0 || diffTotals.deleted > 0);

  return (
    <>
      <Tooltip>
        <TooltipTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={() => setVisible(!visible)}
          >
            <Icon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span className="flex items-center gap-1.5">
            <span>{label}</span>
            <HotkeyCombo action={HotkeyActions.TOGGLE_FILE_TREE} size="xs" />
          </span>
        </TooltipContent>
      </Tooltip>
      {showDiff && (
        <span className="flex min-w-0 shrink-0 flex-col font-mono text-[0.5rem] text-muted-foreground tabular-nums leading-none">
          <span className="text-success-foreground">+{diffTotals.added}</span>
          <span className="text-error-foreground">-{diffTotals.deleted}</span>
        </span>
      )}
    </>
  );
}
