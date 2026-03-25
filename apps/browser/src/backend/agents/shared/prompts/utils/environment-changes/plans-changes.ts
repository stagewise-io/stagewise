import type { PlansSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import type { EnvironmentChangeEntry } from './types';
import { PLANS_PREFIX } from '@shared/plan-ownership';

type PlanEntry = PlansSnapshot['entries'][number];

/**
 * Finds the first unchecked task across all task groups and returns
 * its text, or `null` when every task is complete.
 */
function findNextTask(entry: PlanEntry): string | null {
  for (const group of entry.taskGroups)
    for (const task of group.tasks) if (!task.completed) return task.text;

  return null;
}

/** Appends a "Next: …" or "All tasks complete." suffix. */
function nextTaskSuffix(entry: PlanEntry): string {
  const next = findNextTask(entry);
  return next ? `. Next: ${next}` : '. All tasks complete.';
}

/**
 * Compares two plans snapshots and produces structured change entries
 * for added, removed, or progress-updated plans.
 */
export function computePlansChanges(
  previous: PlansSnapshot | null,
  current: PlansSnapshot,
): EnvironmentChangeEntry[] {
  if (!previous) return [];

  const changes: EnvironmentChangeEntry[] = [];

  const prevByKey = new Map(previous.entries.map((e) => [e.filename, e]));
  const currByKey = new Map(current.entries.map((e) => [e.filename, e]));

  for (const [key, curr] of currByKey) {
    const prev = prevByKey.get(key);
    if (!prev) {
      changes.push({
        type: 'plan-added',
        summary: `Plan "${curr.name}" added (${curr.completedTasks}/${curr.totalTasks} tasks)${nextTaskSuffix(curr)}`,
        attributes: {
          file: `${PLANS_PREFIX}/${curr.filename}`,
        },
      });
    } else if (
      prev.completedTasks !== curr.completedTasks ||
      prev.totalTasks !== curr.totalTasks
    ) {
      changes.push({
        type: 'plan-progress',
        summary: `Plan "${curr.name}" progress: ${prev.completedTasks}/${prev.totalTasks} → ${curr.completedTasks}/${curr.totalTasks}${nextTaskSuffix(curr)}`,
        attributes: {
          file: `${PLANS_PREFIX}/${curr.filename}`,
        },
      });
    }
  }

  for (const [key, prev] of prevByKey) {
    if (!currByKey.has(key)) {
      changes.push({
        type: 'plan-removed',
        summary: `Plan "${prev.name}" removed`,
        attributes: {
          file: `${PLANS_PREFIX}/${prev.filename}`,
        },
      });
    }
  }

  return changes;
}
