import { produce } from 'immer';
import { describe, it, expect } from 'vitest';
import type { AgentState } from '@shared/karton-contracts/ui/agent';
import { clearPendingApproval } from './pending-approvals-cleanup';

/**
 * These tests lock in the `pendingApprovals` cleanup invariant:
 * no tool call transitioning away from `approval-requested` (approval
 * responded, flushed via a fresh user message, or aborted via
 * stopCurrentStep) should leave a stale classifier explanation behind.
 *
 * The three call sites in `base-agent.ts` all funnel through
 * `clearPendingApproval`, so covering this single helper is sufficient
 * regression coverage for the memory-leak fix without standing up a
 * full BaseAgent + karton state store.
 */

function makeState(pendingApprovals: Record<string, string>): AgentState {
  return {
    pendingApprovals,
  } as unknown as AgentState;
}

describe('clearPendingApproval', () => {
  it('removes the matching entry by toolCallId', () => {
    const base = makeState({
      'call-a': 'reasoning A',
      'call-b': 'reasoning B',
    });
    const next = produce(base, (draft) => {
      clearPendingApproval(draft, { toolCallId: 'call-a' });
    });
    expect(next.pendingApprovals).toEqual({ 'call-b': 'reasoning B' });
  });

  it('is a no-op when toolCallId is missing / falsy', () => {
    const base = makeState({ 'call-a': 'reasoning A' });
    const next = produce(base, (draft) => {
      clearPendingApproval(draft, { toolCallId: '' });
    });
    // Immer returns the same reference when nothing is mutated.
    expect(next).toBe(base);
    expect(next.pendingApprovals).toEqual({ 'call-a': 'reasoning A' });
  });

  it('is a no-op when the key is not present', () => {
    const base = makeState({ 'call-a': 'reasoning A' });
    const next = produce(base, (draft) => {
      clearPendingApproval(draft, { toolCallId: 'call-missing' });
    });
    expect(next.pendingApprovals).toEqual({ 'call-a': 'reasoning A' });
  });

  it('does not touch unrelated keys', () => {
    const base = makeState({
      'call-a': 'reasoning A',
      'call-b': 'reasoning B',
      'call-c': 'reasoning C',
    });
    const next = produce(base, (draft) => {
      clearPendingApproval(draft, { toolCallId: 'call-b' });
    });
    expect(next.pendingApprovals).toEqual({
      'call-a': 'reasoning A',
      'call-c': 'reasoning C',
    });
  });
});
