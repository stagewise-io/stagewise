import type { Draft } from 'immer';
import type { AgentState } from '@shared/karton-contracts/ui/agent';

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
 * Takes a plain object (not a tool-part union) so TypeScript doesn't have
 * to re-instantiate the deep `AgentToolUIPart | DynamicToolUIPart` union
 * at every call site.
 */
export function clearPendingApproval(
  draft: Draft<AgentState>,
  toolPart: { toolCallId?: string },
): void {
  if (toolPart.toolCallId) {
    delete draft.pendingApprovals[toolPart.toolCallId];
  }
}
