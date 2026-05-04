import { produce } from 'immer';
import { describe, it, expect } from 'vitest';
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

type Approvals = Record<string, { explanation: string }>;

function makeState(entries: Record<string, string>): {
  pendingApprovals: Approvals;
} {
  const pendingApprovals: Approvals = {};
  for (const [key, explanation] of Object.entries(entries)) {
    pendingApprovals[key] = { explanation };
  }
  return { pendingApprovals };
}

describe('clearPendingApproval', () => {
  it('removes the matching entry by toolCallId', () => {
    const base = makeState({
      'call-a': 'reasoning A',
      'call-b': 'reasoning B',
    });
    const next = produce(base, (draft) => {
      clearPendingApproval(draft.pendingApprovals, 'call-a');
    });
    expect(next.pendingApprovals).toEqual({
      'call-b': { explanation: 'reasoning B' },
    });
  });

  it('is a no-op when toolCallId is missing / falsy', () => {
    const base = makeState({ 'call-a': 'reasoning A' });
    const next = produce(base, (draft) => {
      clearPendingApproval(draft.pendingApprovals, '');
    });
    // Immer returns the same reference when nothing is mutated.
    expect(next).toBe(base);
    expect(next.pendingApprovals).toEqual({
      'call-a': { explanation: 'reasoning A' },
    });
  });

  it('is a no-op when the key is not present', () => {
    const base = makeState({ 'call-a': 'reasoning A' });
    const next = produce(base, (draft) => {
      clearPendingApproval(draft.pendingApprovals, 'call-missing');
    });
    expect(next.pendingApprovals).toEqual({
      'call-a': { explanation: 'reasoning A' },
    });
  });

  it('does not touch unrelated keys', () => {
    const base = makeState({
      'call-a': 'reasoning A',
      'call-b': 'reasoning B',
      'call-c': 'reasoning C',
    });
    const next = produce(base, (draft) => {
      clearPendingApproval(draft.pendingApprovals, 'call-b');
    });
    expect(next.pendingApprovals).toEqual({
      'call-a': { explanation: 'reasoning A' },
      'call-c': { explanation: 'reasoning C' },
    });
  });
});
