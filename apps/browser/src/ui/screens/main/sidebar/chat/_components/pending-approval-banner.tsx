import { useCallback, useState } from 'react';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useComparingSelector } from '@stagewise/karton/react/client';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  IconTerminalOutline18,
  IconLoader6Outline18,
} from 'nucleo-ui-outline-18';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';

type PendingApproval = {
  approvalId: string;
  label: string;
};

const EMPTY: PendingApproval[] = [];

function sameApprovals(a: PendingApproval[], b: PendingApproval[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.approvalId !== b[i]!.approvalId || a[i]!.label !== b[i]!.label)
      return false;
  }
  return true;
}

export function PendingApprovalBanner() {
  const [openAgentId] = useOpenAgent();
  const sendApproval = useKartonProcedure(
    (p) => p.agents.sendToolApprovalResponse,
  );
  const [respondingIds, setRespondingIds] = useState<string[]>([]);

  const pendingApprovals = useKartonState(
    useComparingSelector((s): PendingApproval[] => {
      if (!openAgentId) return EMPTY;
      const history = s.agents.instances[openAgentId]?.state.history;
      if (!history?.length) return EMPTY;

      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i]!;
        if (msg.role !== 'assistant') continue;

        const result: PendingApproval[] = [];
        for (const part of msg.parts) {
          if (
            part.type !== 'tool-executeShellCommand' ||
            part.state !== 'approval-requested'
          )
            continue;
          const shellPart = part as Extract<
            AgentToolUIPart,
            { type: 'tool-executeShellCommand' }
          >;
          if (!shellPart.approval?.id) continue;
          const input = shellPart.input as {
            explanation?: string;
            command?: string;
          } | null;
          result.push({
            approvalId: shellPart.approval.id,
            label: input?.explanation || input?.command || 'Run command',
          });
        }
        return result.length > 0 ? result : EMPTY;
      }
      return EMPTY;
    }, sameApprovals),
  );

  const handleRespond = useCallback(
    async (approvalId: string, approved: boolean) => {
      if (!openAgentId || respondingIds.includes(approvalId)) return;
      setRespondingIds((prev) => [...prev, approvalId]);
      try {
        await sendApproval(
          openAgentId,
          approvalId,
          approved,
          approved ? undefined : 'User denied',
        );
      } catch {
        setRespondingIds((prev) => prev.filter((id) => id !== approvalId));
      }
    },
    [openAgentId, sendApproval, respondingIds],
  );

  if (pendingApprovals.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {pendingApprovals.map((approval) => {
        const isResponding = respondingIds.includes(approval.approvalId);
        return (
          <div
            key={approval.approvalId}
            className="flex shrink-0 flex-col gap-1.5 rounded-md bg-background p-2.5 shadow-elevation-1 ring-1 ring-derived-strong dark:bg-surface-1"
          >
            <div className="flex flex-row items-start gap-2">
              <IconTerminalOutline18 className="mt-0.5 size-3.5 shrink-0 text-warning-foreground" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="font-medium text-warning-foreground text-xs">
                  Approval needed
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {approval.label}
                </p>
              </div>
            </div>
            <div className="flex flex-row-reverse items-center gap-2">
              <Button
                variant="primary"
                size="xs"
                onClick={() => handleRespond(approval.approvalId, true)}
                disabled={isResponding}
              >
                {isResponding && (
                  <IconLoader6Outline18 className="size-3 shrink-0 animate-spin" />
                )}
                Allow
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleRespond(approval.approvalId, false)}
                disabled={isResponding}
              >
                Skip
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
