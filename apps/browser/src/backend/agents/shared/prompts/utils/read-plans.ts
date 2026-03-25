import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PLANS_PREFIX } from '@shared/plan-ownership';
import {
  parsePlanContent,
  type PlanTask,
  type TaskGroup,
} from '@shared/plan-parsing';

export { PLANS_PREFIX };
export type { PlanTask, TaskGroup };

export interface PlanSummary {
  name: string;
  /** One-sentence description (first paragraph after the # heading), or `null`. */
  description: string | null;
  filename: string;
  totalTasks: number;
  completedTasks: number;
  taskGroups: TaskGroup[];
}

/**
 * Read all plan markdown files from the given directory.
 *
 * @param plansDir - Absolute path to the plans directory
 *                   (e.g. the global `getPlansDir()` path).
 */
export async function readPlans(plansDir: string): Promise<PlanSummary[]> {
  if (!existsSync(plansDir)) return [];

  const entries = await readdir(plansDir, { withFileTypes: true });
  const plans: PlanSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const filePath = resolve(plansDir, entry.name);
    const content = await readFile(filePath, 'utf-8');
    const parsed = parsePlanContent(content);
    if (!parsed.name) continue;

    plans.push({
      name: parsed.name,
      description: parsed.description,
      filename: entry.name,
      totalTasks: parsed.totalTasks,
      completedTasks: parsed.completedTasks,
      taskGroups: parsed.taskGroups,
    });
  }

  plans.sort((a, b) => a.name.localeCompare(b.name));
  return plans;
}
