import { memo, useMemo } from 'react';
import { useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { IconClipboardContent } from 'nucleo-micro-bold';
import { getLastOwnedPlanPath, PLANS_PREFIX } from '@shared/plan-ownership';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';

const EMPTY_HISTORY: AgentMessage[] = [];

/**
 * Compact full-width card rendered in place of the normal user-message
 * bubble when the message carries an `/implement` slash command.
 *
 * Derives the target plan from the agent's history (most recently
 * written plan file). Clicking the card enters edit mode (same as
 * clicking a normal user message).
 *
 * Owns its own `useKartonState` selectors so the heavy `MessageUser`
 * component doesn't re-render on every tick.
 */
export const MessageUserPlanAction = memo(function MessageUserPlanAction({
  onEdit,
}: {
  onEdit?: () => void;
}) {
  const [openAgent] = useOpenAgent();

  // Agent history — used to derive the most recent plan
  const history = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.history ?? EMPTY_HISTORY)
      : EMPTY_HISTORY,
  );

  // Derive filename from last written plan path (e.g. "plans/foo.md" → "foo.md")
  const planFilename = useMemo(() => {
    const path = getLastOwnedPlanPath(history);
    if (!path) return null;
    return path.startsWith(`${PLANS_PREFIX}/`)
      ? path.slice(PLANS_PREFIX.length + 1)
      : (path.split('/').pop() ?? null);
  }, [history]);

  // Live task progress from global plans
  const globalPlans = useKartonState((s) => s.plans);

  const planDisplay = useMemo(() => {
    if (!planFilename) return null;
    const plan = globalPlans.find((p) => p.filename === planFilename);
    if (plan) {
      const tasks = plan.taskGroups.flatMap((g) => g.tasks);
      const done = tasks.filter((t) => t.completed).length;
      return { name: plan.name, done, total: tasks.length };
    }
    // Plan exists in history but not on disk yet
    return {
      name: planFilename.replace(/\.md$/, ''),
      done: 0,
      total: 0,
    };
  }, [planFilename, globalPlans]);

  const planName = planDisplay?.name ?? 'plan';

  return (
    <div
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={onEdit}
      onKeyDown={
        onEdit
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEdit();
              }
            }
          : undefined
      }
      className={`mt-2 flex w-full items-center gap-1.5 rounded-lg border border-derived bg-surface-1 px-2.5 py-1.5 text-[13px] dark:bg-surface-tinted ${onEdit ? 'cursor-pointer hover:bg-hover-derived active:bg-active-derived' : ''}`}
    >
      <IconClipboardContent className="size-3 shrink-0 text-muted-foreground dark:text-foreground" />
      <span className="font-semibold text-muted-foreground dark:text-foreground">
        Implement
      </span>
      <span className="min-w-0 flex-1 truncate font-normal text-subtle-foreground dark:font-light dark:text-foreground">
        {planName}
      </span>
      {planDisplay && planDisplay.total > 0 && (
        <span className="shrink-0 text-subtle-foreground dark:text-foreground">
          {planDisplay.done}/{planDisplay.total}
        </span>
      )}
    </div>
  );
});
