/**
 * Compile-time parity assertions between `@stagewise/agent-core`'s
 * `AgentSystemState` and the Karton `AppState.agents` / `AppState.toolbox`
 * slices.
 *
 * Purpose:
 * - Lock the package ↔ Karton shape in place so a drive-by change to either
 *   side trips the typecheck instead of producing silent bridge bugs.
 * - Document the three intentional deltas (D14, D22) as commented shim types
 *   rather than as free-floating prose.
 *
 * Source of truth for the annotations and decisions:
 * `packages/agent-core/src/store/state-annotation.md`
 * `packages/agent-core/SPEC.md` — decisions D13, D14, D22.
 *
 * This file is type-only and produces no runtime output. It must stay
 * host-side: importing from `apps/browser/src/shared` into the agent-core
 * package would invert the Phase-1 dependency direction.
 */
import type {
  AgentInstanceState as CoreAgentInstanceState,
  AgentSystemState as CoreAgentSystemState,
  PendingUserQuestion as CorePendingUserQuestion,
  ShellSessionSummary as CoreShellSessionSummary,
  ToolboxAgentState as CoreToolboxAgentState,
} from '@stagewise/agent-core/store';
import type { AgentState as CoreAgentState } from '@stagewise/agent-core/types/agent';
import type { AppState } from './index';
import type { AgentMessage, AgentState as HostAgentState } from './agent';
import type {
  QuestionAnswerValue,
  QuestionField,
  UIAgentTools,
} from './agent/tools/types';

/* ------------------------------------------------------------------ */
/* Type-equality helper                                                */
/* ------------------------------------------------------------------ */

/**
 * Strict structural equality. Resolves to `true` iff `A` and `B` are mutually
 * assignable after alias expansion; `never` otherwise. `never` collapses to
 * `false` in the assertion position below and surfaces as a typecheck error.
 */
type AssertEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : never;

/** Assertion sink: a `true` value type here is the success condition. */
type Assert<T extends true> = T;

/* ------------------------------------------------------------------ */
/* Intentional delta bridges                                           */
/*                                                                    */
/* Each bridge re-types the core shape to match the Karton shape for  */
/* exactly one documented decision. The bridges are additive — they   */
/* compose to produce a "Karton-projected core state", which is then  */
/* compared against the actual Karton state for strict equality.      */
/* ------------------------------------------------------------------ */

/**
 * Delta D22 (Phase 6) — `toolApprovalMode` is store-canonical on core
 * `AgentState` as `string`; the host narrows it to the `ToolApprovalMode`
 * union via `Omit<CoreAgentState, 'activeModelId' | 'toolApprovalMode'> &
 * { activeModelId: ModelId; toolApprovalMode: ToolApprovalMode }`.
 *
 * Delta D14 (partial) — the host specializes `AgentMessage` with
 * `UIAgentTools` and `UserMessageMetadata`, and `activeModelId` narrows
 * from `string` to `ModelId`. Both substitutions land via `HostAgentState`.
 */
type BridgedAgentInstanceState = Omit<
  CoreAgentInstanceState<UIAgentTools>,
  'state'
> & {
  state: HostAgentState;
};

/**
 * Delta D14 — `ShellSessionSummary` is kept in the package to avoid host
 * imports, but is structurally identical to the Karton `ShellSessionSnapshot`
 * used by `ShellSessionSummary` here.
 *
 * Delta D14 — `PendingUserQuestion` is generic in the package and
 * specialized with `QuestionField` / `QuestionAnswerValue` in Karton.
 */
type BridgedToolboxAgentState = CoreToolboxAgentState<
  QuestionField,
  QuestionAnswerValue
>;

/**
 * Full Karton-projected core state. Compare this against the actual
 * `AppState['agents']` / `AppState['toolbox']` slices.
 */
type BridgedCoreSystemState = {
  agents: {
    instances: {
      [agentInstanceId: string]: BridgedAgentInstanceState;
    };
  };
  toolbox: {
    [agentInstanceId: string]: BridgedToolboxAgentState;
  };
};

/* ------------------------------------------------------------------ */
/* Structural bridges for the `ShellSessionSummary` delta              */
/* ------------------------------------------------------------------ */

/**
 * `ShellSessionSummary` (core) and `ShellSessionSnapshot` (Karton) are
 * declared separately per D14. The assertion below confirms they stay
 * byte-identical; the toolbox-level assertion further down tolerates the
 * name difference because both are structural records.
 */
import type { ShellSessionSnapshot } from './agent/metadata';
type _ShellSessionParity = Assert<
  AssertEqual<CoreShellSessionSummary, ShellSessionSnapshot>
>;

/**
 * `PendingUserQuestion` parity in its Karton-specialized form.
 * (The Karton `PendingUserQuestion` type is defined inline in `./index.ts`
 * above `AppState`. It is not re-exported, so we re-declare the structural
 * form here and assert equality.)
 */
type KartonPendingUserQuestion = {
  id: string;
  title: string;
  description?: string;
  steps: Array<{
    title?: string;
    description?: string;
    fields: QuestionField[];
  }>;
  currentStep: number;
  answers: Record<string, QuestionAnswerValue>;
};
type _PendingUserQuestionParity = Assert<
  AssertEqual<
    CorePendingUserQuestion<QuestionField, QuestionAnswerValue>,
    KartonPendingUserQuestion
  >
>;

/* ------------------------------------------------------------------ */
/* Delta D22 sanity: host's AgentState = core AgentState + overlay     */
/* ------------------------------------------------------------------ */

/**
 * Sanity-check the D22 narrowing (Phase 6). The host `AgentState` must
 * carry exactly the same keys as `CoreAgentState<AgentMessage>` — no
 * additions and no removals. `toolApprovalMode` is now a core field;
 * only its value type is narrowed by the host. If this assertion
 * breaks, either the host shim grew/shrunk a field, or agent-core's
 * `AgentState` drifted — either way a reviewer needs to check
 * whether the persistence map in `state-annotation.md` is still
 * accurate.
 */
type _AgentStateKeyParity = Assert<
  AssertEqual<keyof HostAgentState, keyof CoreAgentState<AgentMessage>>
>;

/* ------------------------------------------------------------------ */
/* Slice-level assertions                                              */
/* ------------------------------------------------------------------ */

type _AgentsSliceParity = Assert<
  AssertEqual<AppState['agents'], BridgedCoreSystemState['agents']>
>;

type _ToolboxSliceParity = Assert<
  AssertEqual<AppState['toolbox'], BridgedCoreSystemState['toolbox']>
>;

/**
 * Convenience composite — asserts the agents+toolbox slice pair in one go.
 * Not strictly necessary given the two assertions above, but it keeps the
 * "full surface" story visible at a glance.
 */
type _SystemStateParity = Assert<
  AssertEqual<
    Pick<AppState, 'agents' | 'toolbox'>,
    Pick<CoreAgentSystemState, never> extends never
      ? Pick<BridgedCoreSystemState, 'agents' | 'toolbox'>
      : never
  >
>;
