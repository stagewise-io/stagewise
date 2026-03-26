import type { WritePart } from '.';
import { IconClipboardContentOutline18 } from 'nucleo-ui-outline-18';
import {
  parsePlanContent,
  type PlanTask,
  type TaskGroup,
} from '@shared/plan-parsing';
import { getBaseName } from '@shared/path-utils';
import { stripMountPrefix } from '@ui/utils';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { useKartonState } from '@ui/hooks/use-karton';
import { useMemo, useCallback, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { cn } from '@ui/utils';
import { IconClipboardOutline18 } from 'nucleo-ui-outline-18';
import { usePlanPhase } from '@ui/hooks/use-plan-phase';
import { useSendImplement } from '@ui/hooks/use-send-implement';
import { XIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';

/**
 * Dedicated tool-part UI for plan file creation / update.
 * Replaces the generic write diff view when the target path
 * is inside `plans/`.
 */
export const CreatePlanToolPart = ({ part }: { part: WritePart }) => {
  const streaming =
    part.state === 'input-streaming' || part.state === 'input-available';
  const isError = part.state === 'output-error';

  // Plan lifecycle phase — controls whether footer buttons are shown
  const relativePath = part.input?.path ?? '';
  const phase = usePlanPhase(relativePath || null);

  // Parse plan content from the tool input (static, used as fallback)
  const parsed = useMemo(() => {
    if (!part.input?.content) return null;
    return parsePlanContent(part.input.content);
  }, [part.input?.content]);

  // Extract filename from the relative path (e.g. "plans/my-plan.md" → "my-plan.md")
  const filename = useMemo(
    () => getBaseName(stripMountPrefix(relativePath)),
    [relativePath],
  );

  // Live plan data from global plans (updates when file changes on disk)
  const globalPlans = useKartonState((s) => s.plans);

  const livePlan = useMemo(() => {
    if (!filename) return null;
    return globalPlans.find((p) => p.filename === filename) ?? null;
  }, [filename, globalPlans]);

  // Prefer live task groups over static parsed content
  const taskGroups: TaskGroup[] = useMemo(
    () => livePlan?.taskGroups ?? parsed?.taskGroups ?? [],
    [livePlan, parsed],
  );
  const planName = livePlan?.name ?? parsed?.name;
  const planDescription = parsed?.description;

  // Scroll fade mask for the task list
  const [taskViewport, setTaskViewport] = useState<HTMLElement | null>(null);
  const taskViewportRef = useMemo(
    () => ({ current: taskViewport }),
    [taskViewport],
  ) as React.RefObject<HTMLElement>;
  const { maskStyle } = useScrollFadeMask(taskViewportRef, {
    axis: 'vertical',
    fadeDistance: 16,
  });

  // Navigation: open plan in a tab
  const createTab = useKartonProcedure((p) => p.browser.createTab);
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const goToUrl = useKartonProcedure((p) => p.browser.goto);
  const tabs = useKartonState((s) => s.browser.tabs);

  // Implement: send a synthetic /implement message to the agent
  const handleImplement = useSendImplement();

  const handleOpenPlan = useCallback(() => {
    const baseUrl = `stagewise://internal/plan/${encodeURIComponent(filename)}`;
    const existingTab = Object.values(tabs).find((tab) =>
      tab.url.startsWith(baseUrl),
    );
    if (existingTab) {
      void switchTab(existingTab.id);
      void goToUrl(baseUrl, existingTab.id);
    } else {
      void createTab(baseUrl, true);
    }
  }, [filename, tabs, switchTab, goToUrl, createTab]);

  // Streaming state — plain text label like ask-user-questions
  if (streaming) {
    return (
      <div className="flex h-6 w-full items-center gap-1 font-medium text-muted-foreground">
        <IconClipboardOutline18 className="size-3 shrink-0 text-primary-foreground" />
        <span className="shimmer-text-primary text-xs">Creating plan…</span>
      </div>
    );
  }

  // Error state — matches standard tool error style (muted inline text)
  if (isError) {
    const errorText = part.errorText ?? 'Failed to create plan';
    return (
      <div className="flex max-w-full cursor-default items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
        <XIcon className="size-3 shrink-0" />
        <Tooltip>
          <TooltipTrigger>
            <span className="min-w-0 truncate text-xs">{errorText}</span>
          </TooltipTrigger>
          <TooltipContent>{errorText}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  // Success state — rich card
  return (
    <div className="mt-6 w-full overflow-hidden rounded-lg border border-border-subtle bg-background shadow-xs dark:border-border dark:bg-surface-1">
      {/* Body: title + description + tasks */}
      <div className="px-3 pt-2.5 pb-2">
        {/* Plan title */}
        {planName && (
          <div className="flex items-center gap-2 pb-2">
            <IconClipboardContentOutline18 className="size-3 shrink-0 text-muted-foreground" />
            <h3 className="font-semibold text-foreground text-sm">
              {planName}
            </h3>
          </div>
        )}

        {/* Description */}
        {planDescription && (
          <p className="-mt-1.5 line-clamp-3 pb-2.5 text-muted-foreground text-xs leading-relaxed">
            {planDescription}
          </p>
        )}

        {/* Task preview — grouped, scrollable with fade */}
        {taskGroups.length > 0 && (
          <div
            ref={setTaskViewport}
            className="mask-alpha scrollbar-subtle max-h-40 overflow-y-auto rounded-md"
            style={maskStyle}
          >
            {taskGroups.map((group, gi) => (
              <div key={`${gi}-${group.label}`}>
                {group.label && (
                  <div className="shrink-0 px-1 pt-1 pb-0.5 text-subtle-foreground text-xs">
                    {group.label}
                  </div>
                )}
                {group.tasks.map((task, ti) => (
                  <TaskPreviewRow
                    key={`${gi}-${ti}-${task.text}`}
                    task={task}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer: always show View Plan; Implement only when just created */}
      <div className="flex items-center justify-end gap-1 border-border/30 px-1.5 py-1.5 dark:border-border/70">
        <Button variant="ghost" size="xs" onClick={handleOpenPlan}>
          Open Plan
        </Button>
        {phase === 'just-created' && (
          <Button variant="primary" size="xs" onClick={handleImplement}>
            Implement
          </Button>
        )}
      </div>
    </div>
  );
};

function TaskPreviewRow({ task }: { task: PlanTask }) {
  return (
    <div className="flex items-start gap-1.5 py-0.5 text-xs">
      <div className="flex size-5 shrink-0 items-center justify-center">
        <Checkbox
          size="2xs"
          checked={task.completed}
          disabled
          className={cn(
            'pointer-events-none',
            task.completed ? 'opacity-40' : 'opacity-65',
            'dark:bg-surface-2',
          )}
        />
      </div>
      <span
        className={cn(
          'min-w-0 text-foreground leading-5',
          task.completed && 'text-subtle-foreground line-through',
        )}
      >
        {task.text}
      </span>
    </div>
  );
}
