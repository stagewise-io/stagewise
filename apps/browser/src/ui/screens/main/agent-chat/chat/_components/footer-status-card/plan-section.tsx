import { Button } from '@stagewise/stage-ui/components/button';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@ui/utils';
import type { MouseEvent } from 'react';
import type { StatusCardSection } from './shared';
import type { PlanTask, TaskGroup } from '@shared/plan-parsing';
import type { PlanUIPhase } from '@shared/plan-lifecycle';
import { IconClipboardContentOutline18 } from 'nucleo-ui-outline-18';

export type { PlanTask, TaskGroup };

export interface PlanEntry {
  name: string;
  filename: string;
  totalTasks: number;
  completedTasks: number;
  taskGroups: TaskGroup[];
  phase: PlanUIPhase;
}

export interface PlanSectionProps {
  plans: PlanEntry[];
  onOpenPlan: (filename: string) => void;
  onImplement: () => void;
}

function TaskRow({ task, isCurrent }: { task: PlanTask; isCurrent: boolean }) {
  let textColor: string;
  if (task.completed) textColor = 'text-subtle-foreground';
  else if (isCurrent) textColor = 'text-foreground';
  else textColor = 'text-muted-foreground';

  return (
    <div
      className="flex w-full flex-row items-start gap-1.5 px-1 py-0.5 text-xs"
      style={{ paddingLeft: `${4 + task.depth * 12}px` }}
    >
      <div className="flex size-5 shrink-0 items-center justify-center">
        <Checkbox
          size="2xs"
          checked={task.completed}
          disabled
          className={cn(
            'pointer-events-none',
            task.completed ? 'opacity-40' : !isCurrent && 'opacity-65',
          )}
        />
      </div>
      <span
        className={cn(
          'min-w-0 leading-5',
          textColor,
          task.completed && 'line-through',
        )}
      >
        {task.text}
      </span>
    </div>
  );
}

function PlanContent({ taskGroups }: { taskGroups: TaskGroup[] }) {
  // Collect all tasks across groups to find the first incomplete one
  const allTasks: { groupIdx: number; taskIdx: number }[] = [];
  for (let gi = 0; gi < taskGroups.length; gi++)
    for (let ti = 0; ti < taskGroups[gi]!.tasks.length; ti++)
      allTasks.push({ groupIdx: gi, taskIdx: ti });

  const firstIncomplete = allTasks.find(
    ({ groupIdx, taskIdx }) => !taskGroups[groupIdx]!.tasks[taskIdx]!.completed,
  );

  return (
    <div className="pt-1">
      {taskGroups.map((group, gi) => (
        <div key={`${gi}-${group.label}`}>
          {group.label && (
            <div className="shrink-0 px-2 pt-1.5 pb-0.5 font-medium text-subtle-foreground text-xs">
              {group.label}
            </div>
          )}
          {group.tasks.map((task, ti) => {
            const isCurrent =
              firstIncomplete?.groupIdx === gi &&
              firstIncomplete?.taskIdx === ti;
            return (
              <TaskRow
                key={`${gi}-${ti}-${task.text}`}
                task={task}
                isCurrent={isCurrent}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Returns one StatusCardSection per plan.
 * Each section has the plan name as header and grouped task items as content.
 */
export function buildPlanSections({
  plans,
  onOpenPlan,
  onImplement,
}: PlanSectionProps): StatusCardSection[] {
  return plans.map((plan) => {
    const isImplementing = plan.phase === 'implementing';
    const showImplement =
      plan.phase === 'awaiting-action' ||
      plan.phase === 'idle' ||
      isImplementing;
    const showOpenPlan = plan.phase !== 'completed';
    const hasTasks = plan.taskGroups.some((g) => g.tasks.length > 0);

    return {
      key: `plan-${plan.filename}`,
      defaultOpen: false,
      scrollable: true,
      contentClassName: 'px-0',
      trigger: (isOpen: boolean) => (
        <div className="flex h-6 w-full flex-row items-center justify-between gap-6 pl-1.5 text-muted-foreground text-xs hover:text-foreground has-[button:hover]:text-muted-foreground">
          <div className="flex min-w-0 shrink flex-row items-center gap-2">
            <ChevronDownIcon
              className={cn(
                'size-3 shrink-0 transition-transform duration-50',
                isOpen && 'rotate-180',
              )}
            />
            <IconClipboardContentOutline18 className="size-3 shrink-0" />
            <span className="truncate">{plan.name}</span>
            {plan.totalTasks > 0 && (
              <span className="shrink-0 text-subtle-foreground">
                ({plan.completedTasks}/{plan.totalTasks})
              </span>
            )}
          </div>
          <div className="ml-auto flex shrink-0 flex-row items-center gap-1">
            {showOpenPlan && (
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 cursor-pointer"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  onOpenPlan(plan.filename);
                }}
              >
                Open Plan
              </Button>
            )}
            {showImplement && (
              <Button
                variant="primary"
                size="xs"
                className={cn(
                  'shrink-0',
                  isImplementing ? 'cursor-default' : 'cursor-pointer',
                )}
                disabled={isImplementing}
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  onImplement();
                }}
              >
                {isImplementing ? 'Implementing' : 'Implement'}
              </Button>
            )}
          </div>
        </div>
      ),
      content: hasTasks ? <PlanContent taskGroups={plan.taskGroups} /> : null,
    };
  });
}
