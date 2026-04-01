/**
 * Plan lifecycle phase derivation.
 *
 * Determines the UI phase of a plan based on the agent's message
 * history, live plan data, and agent working state.
 *
 * Pure function — no Node.js or browser dependencies. Usable from
 * both the UI (hooks, components) and tests.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The UI phase of a plan, controlling which component shows controls
 * and what actions are available.
 *
 * - `just-created`  — Plan was written this turn; no user message after it yet.
 *                     `create-plan.tsx` shows full card with buttons.
 *                     `plan-section.tsx` is hidden.
 *
 * - `awaiting-action` — User sent a message after the plan was created,
 *                       but hasn't sent `/implement` yet.
 *                       `create-plan.tsx` hides footer buttons.
 *                       `plan-section.tsx` shows with "Implement" action.
 *
 * - `implementing`  — `/implement` was sent and agent is currently working.
 *                     Both components hide action buttons; progress only.
 *
 * - `idle`          — `/implement` was sent, agent finished, but tasks remain.
 *                     `plan-section.tsx` shows with "Implement" action.
 *
 * - `completed`     — All tasks are checked off.
 *                     `plan-section.tsx` shows "Done" button.
 */
export type PlanUIPhase =
  | 'just-created'
  | 'awaiting-action'
  | 'implementing'
  | 'idle'
  | 'completed';

/**
 * Minimal message shape for phase derivation.
 * Extends the ownership scanner shape with text access
 * for detecting `/implement` slash command links.
 */
export interface PhaseScanMessage {
  role: string;
  parts: ReadonlyArray<{
    type: string;
    text?: string;
    input?: unknown;
    state?: string;
  }>;
}

/**
 * Live plan data from the global `plans[]` array (Karton state).
 * Only the fields needed for phase derivation.
 */
export interface LivePlanData {
  totalTasks: number;
  completedTasks: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether the last assistant message in history has any tool
 * parts still awaiting user approval. This means the agent is
 * effectively "busy" even though `isWorking` is `false`.
 */
function hasPendingApproval(history: readonly PhaseScanMessage[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    if (msg.role !== 'assistant') continue;
    return msg.parts.some(
      (p) =>
        (p.type.startsWith('tool-') || p.type === 'dynamic-tool') &&
        p.state === 'approval-requested',
    );
  }
  return false;
}

/** Regex to detect `[…](slash:command:implement)` in message text. */
const IMPLEMENT_LINK_RE = /\(slash:command:implement\)/;

/**
 * Check whether a user message is an "implement" action.
 *
 * Detects the `[/implement](slash:command:implement)` link in the message text.
 * Untargeted — applies to any plan owned by the agent.
 */
function isImplementMessage(msg: PhaseScanMessage): boolean {
  return msg.parts.some(
    (p) => p.type === 'text' && !!p.text && IMPLEMENT_LINK_RE.test(p.text),
  );
}

// ---------------------------------------------------------------------------
// Core derivation
// ---------------------------------------------------------------------------

/**
 * Derive the UI phase for a specific plan file.
 *
 * Scans the message history to find:
 * 1. The assistant message that created/updated this plan (write).
 * 2. Whether any user message follows that creation point.
 * 3. Whether any user message contains an `/implement` slash command.
 *
 * Then cross-references with `isAgentWorking` and `livePlanData` to
 * produce the final phase.
 *
 * @param history       - The agent's full message history.
 * @param planToolPath  - The plan tool path
 *                        (e.g. `plans/foo.md`).
 * @param isAgentWorking - Whether the agent is currently running.
 * @param livePlanData  - Live task counts from global `plans[]`, or
 *                        `null` if the plan doesn't exist on disk.
 */
export function getPlanUIPhase(
  history: readonly PhaseScanMessage[],
  planToolPath: string,
  isAgentWorking: boolean,
  livePlanData: LivePlanData | null,
): PlanUIPhase {
  // --- 1. Check completion first (takes priority) ---
  if (
    livePlanData &&
    livePlanData.totalTasks > 0 &&
    livePlanData.completedTasks === livePlanData.totalTasks
  ) {
    return 'completed';
  }

  // --- 2. Walk history to find plan-creation and post-creation signals ---
  let planCreationIndex = -1;
  let hasUserMessageAfterCreation = false;
  let hasImplementAfterCreation = false;

  for (let i = 0; i < history.length; i++) {
    const msg = history[i]!;

    // Track the *last* assistant message that wrote to this plan path.
    // We use the last one so that plan updates (re-writes) reset the
    // lifecycle correctly.
    if (msg.role === 'assistant') {
      for (const part of msg.parts) {
        if (part.type !== 'tool-write') continue;
        const input = part.input as { path?: string } | undefined;
        if (typeof input?.path === 'string' && input.path === planToolPath) {
          planCreationIndex = i;
          // Reset downstream flags since we found a newer write
          hasUserMessageAfterCreation = false;
          hasImplementAfterCreation = false;
        }
      }
      continue;
    }

    // Only look at user messages that come *after* the plan creation
    if (
      msg.role === 'user' &&
      planCreationIndex >= 0 &&
      i > planCreationIndex
    ) {
      hasUserMessageAfterCreation = true;

      if (isImplementMessage(msg)) {
        hasImplementAfterCreation = true;
      }
    }
  }

  // Plan was never written by this agent — shouldn't happen if called
  // correctly, but fall back to awaiting-action (safe default).
  if (planCreationIndex < 0) {
    return 'awaiting-action';
  }

  // --- 3. Derive phase from signals ---

  // No user message after creation → plan was just created this turn
  if (!hasUserMessageAfterCreation) {
    return 'just-created';
  }

  // /implement was sent
  if (hasImplementAfterCreation) {
    const agentBusy = isAgentWorking || hasPendingApproval(history);
    return agentBusy ? 'implementing' : 'idle';
  }

  // User sent a message but hasn't triggered /implement
  return 'awaiting-action';
}

// ---------------------------------------------------------------------------
// Batch helper
// ---------------------------------------------------------------------------

/**
 * Derive phases for all plan paths owned by the agent in a single
 * history pass. More efficient than calling `getPlanUIPhase` per plan
 * when multiple plans exist.
 *
 * @returns Map from plan tool path → PlanUIPhase
 */
export function getPlanUIPhases(
  history: readonly PhaseScanMessage[],
  ownedPlanPaths: Set<string>,
  isAgentWorking: boolean,
  livePlanDataByPath: ReadonlyMap<string, LivePlanData>,
): Map<string, PlanUIPhase> {
  if (ownedPlanPaths.size === 0) return new Map();

  // Per-path tracking
  const creationIndex = new Map<string, number>();
  const hasUserAfter = new Map<string, boolean>();
  const hasImplementAfter = new Map<string, boolean>();

  ownedPlanPaths.forEach((path) => {
    creationIndex.set(path, -1);
    hasUserAfter.set(path, false);
    hasImplementAfter.set(path, false);
  });

  // Single pass through history
  for (let i = 0; i < history.length; i++) {
    const msg = history[i]!;

    if (msg.role === 'assistant') {
      for (const part of msg.parts) {
        if (part.type !== 'tool-write') continue;
        const input = part.input as { path?: string } | undefined;
        const path = input?.path;
        if (typeof path === 'string' && creationIndex.has(path)) {
          creationIndex.set(path, i);
          hasUserAfter.set(path, false);
          hasImplementAfter.set(path, false);
        }
      }
      continue;
    }

    if (msg.role === 'user') {
      creationIndex.forEach((ci, path) => {
        if (ci >= 0 && i > ci) {
          hasUserAfter.set(path, true);
          if (isImplementMessage(msg)) {
            hasImplementAfter.set(path, true);
          }
        }
      });
    }
  }

  // Resolve phases
  const result = new Map<string, PlanUIPhase>();

  creationIndex.forEach((ci, path) => {
    const live = livePlanDataByPath.get(path) ?? null;

    // Completed check
    if (
      live &&
      live.totalTasks > 0 &&
      live.completedTasks === live.totalTasks
    ) {
      result.set(path, 'completed');
      return;
    }

    if (ci < 0) {
      result.set(path, 'awaiting-action');
      return;
    }

    if (!hasUserAfter.get(path)) {
      result.set(path, 'just-created');
      return;
    }

    if (hasImplementAfter.get(path)) {
      const agentBusy = isAgentWorking || hasPendingApproval(history);
      result.set(path, agentBusy ? 'implementing' : 'idle');
      return;
    }

    result.set(path, 'awaiting-action');
  });

  return result;
}
