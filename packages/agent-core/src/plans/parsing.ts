/**
 * Pure plan markdown parsing utilities.
 *
 * No Node.js or browser dependencies — usable from both backend
 * (`read-plans.ts`) and UI (`create-plan.tsx`, `plan-section.tsx`).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanTask {
  text: string;
  completed: boolean;
  depth: number;
}

export interface TaskGroup {
  label: string;
  tasks: PlanTask[];
}

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/** Matches the first `# heading` in markdown content. */
const H1_RE = /^#\s+(.+)$/m;

const CHECKBOX_RE = /^([ \t]*)-\s+\[([ xX])\]\s+(.+)$/;
const HEADING_RE = /^#{2,6}\s+(.+)$/;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParsedPlan {
  /** The `# heading` text, or `null` if none found. */
  name: string | null;
  /** First paragraph of body text (between the heading and the first sub-heading / checkbox). */
  description: string | null;
  taskGroups: TaskGroup[];
  totalTasks: number;
  completedTasks: number;
}

/**
 * Parse plan markdown into structured data.
 *
 * Walks lines sequentially:
 * - A `# heading` sets the plan name.
 * - Plain text lines immediately after `# heading` (before any `##`+ or checkbox)
 *   are collected as the description.
 * - A heading (##–######) starts a new task group.
 * - A checkbox line is added to the current group with its indentation depth.
 * - Tasks before any sub-heading go into a group with an empty label.
 */
export function parsePlanContent(content: string): ParsedPlan {
  const h1Match = H1_RE.exec(content);
  const name = h1Match ? h1Match[1]!.trim() : null;

  const groups: TaskGroup[] = [];
  let currentLabel = '';
  let currentTasks: PlanTask[] = [];
  let totalTasks = 0;
  let completedTasks = 0;

  // Description: collect non-empty lines after `# heading` until we hit
  // another heading or a checkbox line.
  const descriptionLines: string[] = [];
  let pastH1 = false;
  let descriptionDone = false;

  for (const line of content.split('\n')) {
    // Detect H1
    if (!pastH1 && /^#\s+/.test(line)) {
      pastH1 = true;
      continue;
    }

    // Collect description lines (between H1 and first sub-heading/checkbox)
    if (pastH1 && !descriptionDone) {
      const isSubHeading = HEADING_RE.test(line);
      const isCheckbox = CHECKBOX_RE.test(line);
      if (isSubHeading || isCheckbox) {
        descriptionDone = true;
        // Fall through to process this line below
      } else {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          descriptionLines.push(trimmed);
        } else if (descriptionLines.length > 0) {
          // Empty line after description text — stop collecting
          descriptionDone = true;
        }
        continue;
      }
    }

    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      // Flush previous group if it had tasks
      if (currentTasks.length > 0) {
        groups.push({ label: currentLabel, tasks: currentTasks });
        currentTasks = [];
      }
      currentLabel = headingMatch[1]!.trim();
      continue;
    }

    const cbMatch = CHECKBOX_RE.exec(line);
    if (cbMatch) {
      const indent = cbMatch[1]!;
      // Convert indent to depth: 2 spaces (or 1 tab) = 1 level
      const depth = indent.includes('\t')
        ? indent.split('\t').length - 1
        : Math.floor(indent.length / 2);
      const completed = cbMatch[2]!.toLowerCase() === 'x';
      currentTasks.push({ text: cbMatch[3]!.trim(), completed, depth });
      totalTasks++;
      if (completed) completedTasks++;
    }
  }

  // Flush last group
  if (currentTasks.length > 0) {
    groups.push({ label: currentLabel, tasks: currentTasks });
  }

  return {
    name,
    description:
      descriptionLines.length > 0 ? descriptionLines.join(' ') : null,
    taskGroups: groups,
    totalTasks,
    completedTasks,
  };
}
