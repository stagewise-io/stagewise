/**
 * Remove the stashed classifier explanation for a tool call, if any.
 * Safe to call unconditionally — a missing/empty `toolCallId` is a no-op,
 * and so is a call for a key that isn't present.
 *
 * Callers should invoke this on every transition away from
 * `approval-requested` (approval responded, flushed via a fresh user
 * message, or aborted via stopCurrentStep) and on force-terminated
 * non-terminal tool states. Centralizing the delete here keeps
 * `pendingApprovals` free of stale entries across all termination paths.
 *
 * The signature takes the `pendingApprovals` record directly — NOT the
 * full `Draft<AgentState>`. Passing `Draft<AgentState>` here was the
 * direct trigger for a TS2589 "Type instantiation is excessively deep"
 * error inside `state.set(draft => …)` blocks once the Karton contract
 * grew large enough: Immer's `Draft<…>` mapped type combined with the
 * deep `AgentState` union caused the compiler to exceed its recursion
 * limit at the call site. Narrowing the parameter to the single map
 * we mutate breaks that inference cycle with zero behavior change.
 */
export function clearPendingApproval(
  pendingApprovals: Record<string, { explanation: string }>,
  toolCallId: string | undefined,
): void {
  if (toolCallId) {
    delete pendingApprovals[toolCallId];
  }
}
