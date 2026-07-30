import { HotkeyCombo } from '@ui/components/hotkey-combo';
import { useCmdEnterTarget } from '@ui/hooks/use-cmd-enter-target';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { CmdEnterPriority } from '@ui/utils/cmd-enter-registry';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { HotkeyActions } from '@shared/hotkeys';
import {
  IconLoader6Outline18,
  IconTriangleWarningOutline18,
} from '@stagewise/icons';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useCallback } from 'react';

export type ApprovableShellToolPart = Extract<
  AgentToolUIPart,
  {
    type:
      | 'tool-createShellSession'
      | 'tool-createWatcherSession'
      | 'tool-executeShellCommand';
  }
>;

export function useShellToolApproval(part: ApprovableShellToolPart) {
  const [openAgentId] = useOpenAgent();
  const sendApproval = useKartonProcedure(
    (procedures) => procedures.agents.sendToolApprovalResponse,
  );
  const setToolApprovalMode = useKartonProcedure(
    (procedures) => procedures.agents.setToolApprovalMode,
  );
  const classifierExplanation = useKartonState((state) =>
    openAgentId
      ? state.agents.instances[openAgentId]?.state.pendingApprovals?.[
          part.toolCallId
        ]?.explanation
      : undefined,
  );
  const currentApprovalMode = useKartonState((state) =>
    openAgentId
      ? state.agents.instances[openAgentId]?.state.toolApprovalMode
      : undefined,
  );

  const handleApprove = useCallback(() => {
    if (
      !openAgentId ||
      part.state !== 'approval-requested' ||
      !part.approval?.id
    )
      return;
    sendApproval(openAgentId, part.approval.id, true);
  }, [openAgentId, part.state, part.approval, sendApproval]);

  const handleDeny = useCallback(() => {
    if (
      !openAgentId ||
      part.state !== 'approval-requested' ||
      !part.approval?.id
    )
      return;
    sendApproval(openAgentId, part.approval.id, false, 'User denied');
  }, [openAgentId, part.state, part.approval, sendApproval]);

  const handleSmartAllow = useCallback(async () => {
    if (
      !openAgentId ||
      part.state !== 'approval-requested' ||
      !part.approval?.id
    )
      return;
    try {
      await setToolApprovalMode(openAgentId, 'smart', 'inline-approval-button');
    } catch (error) {
      console.error(
        '[ShellToolApproval] Failed to switch to smart approval; not approving the current call',
        error,
      );
      return;
    }
    sendApproval(openAgentId, part.approval.id, true);
  }, [
    openAgentId,
    part.state,
    part.approval,
    sendApproval,
    setToolApprovalMode,
  ]);

  const { setRef: allowRef, isWinner: allowIsWinner } = useCmdEnterTarget({
    id: `shell-approval-${part.toolCallId}`,
    priority: CmdEnterPriority.SHELL_APPROVAL,
    action: handleApprove,
    enabled: part.state === 'approval-requested',
  });

  return {
    allowIsWinner,
    allowRef,
    classifierExplanation,
    currentApprovalMode,
    handleApprove,
    handleDeny,
    handleSmartAllow,
  };
}

type ShellToolApproval = ReturnType<typeof useShellToolApproval>;

export function ShellToolApprovalFooter({
  approval,
  isResponded,
}: {
  approval: ShellToolApproval;
  isResponded: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-2.5">
      {approval.classifierExplanation ? (
        <div className="mx-2 flex flex-row items-start gap-1.5 rounded-md px-1 py-0 text-warning-foreground text-xs leading-snug">
          <IconTriangleWarningOutline18 className="mt-[2px] size-3 shrink-0" />
          <div className="min-w-0 flex-1">{approval.classifierExplanation}</div>
        </div>
      ) : null}
      <div className="flex w-full flex-row items-center justify-end gap-1.5">
        <Button
          variant="ghost"
          size="xs"
          onClick={approval.handleDeny}
          disabled={isResponded}
        >
          Skip
        </Button>
        {approval.currentApprovalMode !== 'smart' ? (
          <Tooltip>
            <TooltipTrigger delay={250}>
              <Button
                variant="ghost"
                size="xs"
                onClick={approval.handleSmartAllow}
                disabled={isResponded}
              >
                Smart allow
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" align="end">
              <div className="flex max-w-64 flex-col gap-1 py-1">
                <div className="font-medium">Ask only for risky commands</div>
                <div className="text-muted-foreground">
                  Switches this agent to smart approval. A fast classifier
                  decides per command — destructive or system-level commands
                  still require your approval.
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : null}
        <Button
          ref={approval.allowRef}
          variant="primary"
          size="xs"
          onClick={approval.handleApprove}
          disabled={isResponded}
        >
          {isResponded ? (
            <IconLoader6Outline18 className="size-3 shrink-0 animate-spin" />
          ) : null}
          Allow
          {approval.allowIsWinner ? (
            <HotkeyCombo
              action={HotkeyActions.CMD_ENTER}
              size="xs"
              variant="solid"
              className="ml-0.5"
            />
          ) : null}
        </Button>
      </div>
    </div>
  );
}
