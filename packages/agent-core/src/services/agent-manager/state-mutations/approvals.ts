import type { DynamicToolUIPart } from 'ai';
import { clearPendingApproval } from '../../../agents';
import type { AgentStore } from '../../../store/agent-store';
import type { AgentToolUIPart } from '../../../types/agent';
import type { UserMessageMetadata } from '../../../types/metadata';
import { updateAgentInstanceState } from './internal';

/**
 * Tool-approval state-machine transitions. Each call wraps exactly one
 * `store.update()`. These are the "Bucket C" complex transforms that
 * walk message history and rewrite tool parts in place.
 *
 * Tool-part states considered terminal by the approval/error sweeps:
 * once a part reaches one of these states, neither cancellation nor
 * stream-merge will overwrite it.
 */
const TERMINAL_TOOL_STATES = new Set([
  'output-available',
  'output-error',
  'output-denied',
  'approval-responded',
]);

/**
 * Walk every assistant message in history and force-terminate every
 * non-terminal tool part. Used by the stop / interrupt paths so a
 * cancelled turn leaves no dangling pending-approval entries.
 */
export function denyAllNonTerminalToolPartsInHistory(
  store: AgentStore,
  agentInstanceId: string,
  args: { approvalDenyReason: string; forceErrorText: string },
): void {
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    for (const historyMsg of state.history) {
      if (historyMsg.role !== 'assistant') continue;
      for (let i = 0; i < historyMsg.parts.length; i++) {
        const p = historyMsg.parts[i]!;
        if (!(p.type.startsWith('tool-') || p.type === 'dynamic-tool')) {
          continue;
        }
        const toolPart = p as AgentToolUIPart | DynamicToolUIPart;
        if (TERMINAL_TOOL_STATES.has(toolPart.state)) continue;

        clearPendingApproval(state.pendingApprovals, toolPart.toolCallId);

        if (toolPart.state === 'approval-requested') {
          const updatedToolPart: AgentToolUIPart | DynamicToolUIPart = {
            ...toolPart,
            state: 'output-denied' as const,
            approval: {
              ...toolPart.approval!,
              approved: false,
              reason: args.approvalDenyReason,
            },
          } as AgentToolUIPart | DynamicToolUIPart;
          historyMsg.parts[i] =
            updatedToolPart as unknown as (typeof historyMsg.parts)[number];
        } else {
          const updatedToolPart: AgentToolUIPart | DynamicToolUIPart = {
            ...toolPart,
            state: 'output-error',
            input: toolPart.input ?? {},
            approval: undefined,
            errorText: args.forceErrorText,
          } as AgentToolUIPart | DynamicToolUIPart;
          historyMsg.parts[i] =
            updatedToolPart as unknown as (typeof historyMsg.parts)[number];
        }
      }
    }
  });
}

/**
 * Walk only the last assistant message's tool parts. Used by the
 * runloop's per-step error tail so a single failed step terminates
 * just the in-flight tool calls; cleans up trailing `reasoning` parts
 * and pops the whole message when nothing remains.
 */
export function terminateNonTerminalToolPartsInLastAssistant(
  store: AgentStore,
  agentInstanceId: string,
  args: { approvalDenyReason: string; outputErrorText: string },
): void {
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    const lastMsg = state.history[state.history.length - 1];
    if (lastMsg?.role !== 'assistant') return;

    lastMsg.parts.forEach((p, index) => {
      if (p.type === 'dynamic-tool' || p.type.startsWith('tool-')) {
        const toolPart = p as AgentToolUIPart | DynamicToolUIPart;
        if (toolPart.state === 'approval-requested') {
          clearPendingApproval(state.pendingApprovals, toolPart.toolCallId);
          const updatedToolPart: AgentToolUIPart | DynamicToolUIPart = {
            ...toolPart,
            state: 'output-denied',
            approval: {
              ...toolPart.approval!,
              approved: false,
              reason: args.approvalDenyReason,
            },
          } as AgentToolUIPart | DynamicToolUIPart;
          lastMsg.parts[index] =
            updatedToolPart as unknown as (typeof lastMsg.parts)[number];
        } else if (
          toolPart.state !== 'output-available' &&
          toolPart.state !== 'output-error'
        ) {
          const updatedToolPart: AgentToolUIPart | DynamicToolUIPart = {
            ...toolPart,
            state: 'output-error',
            input: toolPart.input ?? {},
            approval: undefined,
            errorText: args.outputErrorText,
          } as AgentToolUIPart | DynamicToolUIPart;
          lastMsg.parts[index] =
            updatedToolPart as unknown as (typeof lastMsg.parts)[number];
        }
      }
    });

    while (
      lastMsg.parts.length > 0 &&
      lastMsg.parts[lastMsg.parts.length - 1]!.type === 'reasoning'
    ) {
      lastMsg.parts.pop();
      (
        lastMsg.metadata as UserMessageMetadata | undefined
      )?.partsMetadata?.pop();
    }

    if (lastMsg.parts.length === 0) {
      state.history.pop();
    }
  });
}

/**
 * Resolve one pending approval by `approvalId`. Scans history newest-
 * first, flips the matching `approval-requested` tool part to
 * `approval-responded`, and clears the corresponding pending-approval
 * entry. Defensive no-op if the approval is no longer in history.
 */
export function resolveApproval(
  store: AgentStore,
  agentInstanceId: string,
  args: { approvalId: string; approved: boolean; reason?: string },
): void {
  updateAgentInstanceState(store, agentInstanceId, (state) => {
    for (let i = state.history.length - 1; i >= 0; i--) {
      const msg = state.history[i]!;
      if (msg.role !== 'assistant') continue;
      const toolPartIndex = msg.parts.findIndex(
        (part) =>
          (part.type.startsWith('tool-') || part.type === 'dynamic-tool') &&
          (part as AgentToolUIPart | DynamicToolUIPart).approval?.id ===
            args.approvalId,
      );
      if (toolPartIndex !== -1) {
        const part = msg.parts[toolPartIndex] as
          | AgentToolUIPart
          | DynamicToolUIPart;
        clearPendingApproval(state.pendingApprovals, part.toolCallId);
        if (part.state === 'approval-requested') {
          const updatedToolPart: unknown = {
            ...part,
            state: 'approval-responded',
            approval: {
              ...part.approval,
              approved: args.approved,
              reason: args.reason,
            },
          };
          msg.parts[toolPartIndex] =
            updatedToolPart as (typeof msg.parts)[number];
        }
        break;
      }
    }
  });
}
