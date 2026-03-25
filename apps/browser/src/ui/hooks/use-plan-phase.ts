import { useMemo } from 'react';
import { useKartonState } from './use-karton';
import { useOpenAgent } from './use-open-chat';
import {
  getPlanUIPhase,
  type PlanUIPhase,
  type LivePlanData,
} from '@shared/plan-lifecycle';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import { PLANS_PREFIX } from '@shared/plan-ownership';

// Stable empty array to avoid selector identity churn
const EMPTY_HISTORY: AgentMessage[] = [];
const EMPTY_PLANS: {
  filename: string;
  totalTasks: number;
  completedTasks: number;
}[] = [];

/**
 * Derive the {@link PlanUIPhase} for a single plan from Karton state.
 *
 * Reads `agentHistory`, `isWorking`, and the global `plans` array,
 * then delegates to the pure `getPlanUIPhase()` function.
 *
 * @param planToolPath - The plan tool path (e.g. `plans/refactor.md`).
 *   When `null`/`undefined`, returns `'awaiting-action'` as a
 *   safe no-op default.
 */
export function usePlanPhase(
  planToolPath: string | null | undefined,
): PlanUIPhase {
  const [openAgentId] = useOpenAgent();

  const agentHistory = useKartonState((s) =>
    openAgentId
      ? (s.agents.instances[openAgentId]?.state.history ?? EMPTY_HISTORY)
      : EMPTY_HISTORY,
  );

  const isAgentWorking = useKartonState((s) =>
    openAgentId
      ? (s.agents.instances[openAgentId]?.state.isWorking ?? false)
      : false,
  );

  const plans = useKartonState((s) =>
    s.plans.length > 0 ? s.plans : EMPTY_PLANS,
  );

  const livePlanData = useMemo((): LivePlanData | null => {
    if (!planToolPath) return null;

    // Extract filename from tool path: "plans/refactor.md" → "refactor.md"
    const filename = planToolPath.startsWith(`${PLANS_PREFIX}/`)
      ? planToolPath.slice(PLANS_PREFIX.length + 1)
      : null;
    if (!filename) return null;

    const plan = plans.find((p) => p.filename === filename);
    if (plan) {
      return {
        totalTasks: plan.totalTasks,
        completedTasks: plan.completedTasks,
      };
    }
    return null;
  }, [planToolPath, plans]);

  return useMemo(() => {
    if (!planToolPath) return 'awaiting-action' as const;
    return getPlanUIPhase(
      agentHistory,
      planToolPath,
      isAgentWorking,
      livePlanData,
    );
  }, [agentHistory, planToolPath, isAgentWorking, livePlanData]);
}
