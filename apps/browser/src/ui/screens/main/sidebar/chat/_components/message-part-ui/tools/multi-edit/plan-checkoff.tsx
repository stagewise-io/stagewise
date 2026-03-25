import type { MultiEditPart } from '.';
import type { WithDiff } from '@shared/karton-contracts/ui/agent/tools/types';
import { useMemo } from 'react';
import { useKartonState } from '@ui/hooks/use-karton';
import { parsePlanContent } from '@shared/plan-parsing';
import { getBaseName } from '@shared/path-utils';
import { stripMountPrefix } from '@ui/utils';
import { ToolPartUINotCollapsible } from '../shared/tool-part-ui-not-collapsible';
import { IconClipboardContentOutline18 } from 'nucleo-ui-outline-18';

/**
 * Compact tool-part UI for plan checkbox toggles.
 * Renders a single non-collapsible line like:
 *   "Completed 3 of 7 · Some task description…"
 */
export const PlanCheckoffToolPart = ({ part }: { part: MultiEditPart }) => {
  const relativePath = part.input?.relative_path ?? '';
  const filename = useMemo(
    () => getBaseName(stripMountPrefix(relativePath)),
    [relativePath],
  );

  // Parse counts from _diff.after (snapshot at time of this edit).
  // Falls back to live plan state while streaming (no output yet).
  const outputWithDiff = part.output as
    | WithDiff<typeof part.output>
    | undefined;

  const globalPlans = useKartonState((s) => s.plans);
  const livePlan = useMemo(() => {
    if (!filename) return null;
    return globalPlans.find((p) => p.filename === filename) ?? null;
  }, [filename, globalPlans]);

  const snapshotPlan = useMemo(() => {
    const after = outputWithDiff?._diff?.after;
    if (!after) return null;
    return parsePlanContent(after);
  }, [outputWithDiff?._diff?.after]);

  const completedTasks =
    snapshotPlan?.completedTasks ?? livePlan?.completedTasks ?? 0;
  const totalTasks = snapshotPlan?.totalTasks ?? livePlan?.totalTasks ?? 0;

  // Extract the first checked-off task text from the edits for display
  const firstTaskText = useMemo(() => {
    const edits = part.input?.edits;
    if (!Array.isArray(edits) || edits.length === 0) return null;

    for (const edit of edits) {
      const newStr = edit?.new_string ?? '';
      // Match the task text after `- [x] ` or `- [ ] `
      const match = /^\s*- \[[xX ]\] (.+)$/m.exec(newStr);
      if (match) return match[1]!.trim();
    }
    return null;
  }, [part.input?.edits]);

  const streamingText = 'Updating plan…';

  const finishedText = (
    <span className="flex min-w-0 gap-1">
      <span className="shrink-0 font-medium">
        Completed {completedTasks} of {totalTasks}
      </span>
      {firstTaskText && (
        <>
          <span className="shrink-0 opacity-50">·</span>
          <span className="truncate font-normal opacity-75">
            {firstTaskText}
          </span>
        </>
      )}
    </span>
  );

  return (
    <ToolPartUINotCollapsible
      icon={<IconClipboardContentOutline18 className="size-3 shrink-0" />}
      part={part}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
