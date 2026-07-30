import { GitBranchIcon } from 'lucide-react';
import { DiffLineStats } from '@ui/components/diff-line-stats';

export function DiffButtonContent({
  added,
  removed,
  showLabel = true,
}: {
  added: number;
  removed: number;
  showLabel?: boolean;
}) {
  return (
    <>
      <GitBranchIcon className="size-3.5 shrink-0" />
      {showLabel && <span>Diff</span>}
      <DiffLineStats added={added} removed={removed} stacked />
    </>
  );
}
