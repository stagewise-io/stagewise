import {
  IconLoader6Outline18,
  IconTerminalOutline18,
  IconTriangleWarningOutline18,
  IconXmarkOutline18,
} from 'nucleo-ui-outline-18';
import { useCallback, useMemo, useRef } from 'react';
import { ToolPartUI } from './shared/tool-part-ui';
import { useToolAutoExpand } from './shared/use-tool-auto-expand';
import { useIsTruncated } from '@ui/hooks/use-is-truncated';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { cn } from '@ui/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import type { ExecuteShellCommandToolOutput } from '@shared/karton-contracts/ui/agent/tools/types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';

export const ExecuteShellCommandToolPart = ({
  part,
  isLastPart = false,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-executeShellCommand' }>;
  isLastPart?: boolean;
}) => {
  const [openAgentId] = useOpenAgent();
  const sendApproval = useKartonProcedure(
    (p) => p.agents.sendToolApprovalResponse,
  );
  const killShellSession = useKartonProcedure(
    (p) => p.toolbox.killShellSession,
  );
  const setToolApprovalMode = useKartonProcedure(
    (p) => p.agents.setToolApprovalMode,
  );

  const finished = useMemo(
    () =>
      part.state === 'output-available' ||
      part.state === 'output-error' ||
      part.state === 'output-denied',
    [part.state],
  );

  const pendingOutputs = useKartonState((s) =>
    openAgentId
      ? s.toolbox[openAgentId]?.pendingShellOutputs?.[part.toolCallId]
      : undefined,
  );

  const pendingSessionId = useKartonState((s) =>
    openAgentId
      ? s.toolbox[openAgentId]?.pendingShellSessionIds?.[part.toolCallId]
      : undefined,
  );

  const retainedOutputsRef = useRef<string[] | null>(null);
  if (pendingOutputs && pendingOutputs.length > 0)
    retainedOutputsRef.current = pendingOutputs;

  const prevFinishedRef = useRef(finished);
  if (finished && !prevFinishedRef.current) retainedOutputsRef.current = null;
  prevFinishedRef.current = finished;

  const output = part.output as ExecuteShellCommandToolOutput | undefined;

  const state = useMemo(() => {
    if (part.state === 'approval-requested') return 'approval' as const;
    if (part.state === 'input-streaming') return 'approval' as const;
    if (part.state === 'output-denied') return 'denied' as const;
    if (
      part.state === 'approval-responded' &&
      pendingOutputs &&
      pendingOutputs.length > 0
    )
      return 'streaming' as const;
    if (part.state === 'input-available') return 'streaming' as const;
    if (part.state === 'approval-responded')
      return 'approval-responded' as const;
    if (part.state === 'output-error') return 'error' as const;
    return 'success' as const;
  }, [part.state, pendingOutputs]);

  const command = part.input?.command ?? '';
  const explanation = part.input?.explanation ?? '';
  const isStdin = !!part.input?.stdin && !command;
  const isKill = !!part.input?.kill;

  const effectiveOutputText = useMemo(() => {
    if (output?.output) return output.output;
    // Backend always ships a single-element array containing the current
    // rendered grid snapshot. The array shape is preserved for the Karton
    // contract but is effectively scalar — do not re-introduce join-based
    // accumulation here.
    if (retainedOutputsRef.current?.length)
      return retainedOutputsRef.current[0] ?? null;
    return null;
  }, [output?.output, pendingOutputs]);

  const { expanded, handleUserSetExpanded } = useToolAutoExpand({
    isStreaming: state === 'streaming' || state === 'approval',
    isLastPart,
  });

  const handleApprove = useCallback(() => {
    if (
      !openAgentId ||
      part.state !== 'approval-requested' ||
      !part.approval?.id
    )
      return;
    sendApproval(openAgentId, part.approval.id, true);
  }, [openAgentId, part.state, part.approval, sendApproval]);

  const sessionId =
    (part.output as ExecuteShellCommandToolOutput | undefined)?.session_id ??
    pendingSessionId ??
    part.input?.session_id;

  const handleCancel = useCallback(() => {
    if (!openAgentId || !sessionId) return;
    killShellSession(openAgentId, sessionId);
  }, [openAgentId, sessionId, killShellSession]);

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
      // Pass source + approval-context so the backend
      // `tool-approval-mode-changed` event can distinguish this
      // inline/impulsive path from the panel-combobox path and correlate
      // it with the specific approval request the user was answering.
      // The contract signature takes `source` as the 3rd arg; we can't
      // pass tool metadata through the RPC, so the backend won't know
      // `tool_name`/`tool_call_id` for this path — that's OK, analytics
      // can join on the adjacent `tool-approved` event via
      // `agent_instance_id` + timestamp if needed.
      await setToolApprovalMode(openAgentId, 'smart', 'inline-approval-button');
    } catch (error) {
      // Abort the whole action: the user asked for "switch to smart AND
      // approve this one". If the mode flip failed, approving silently
      // would contradict that intent. The regular "Allow" button remains
      // available.
      console.error(
        '[ExecuteShellCommand] Failed to switch to smart approval; not approving the current call',
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

  const classifierExplanation = useKartonState((s) =>
    openAgentId
      ? s.agents.instances[openAgentId]?.state.pendingApprovals?.[
          part.toolCallId
        ]?.explanation
      : undefined,
  );

  const currentApprovalMode = useKartonState((s) =>
    openAgentId
      ? s.agents.instances[openAgentId]?.state.toolApprovalMode
      : undefined,
  );

  const trigger = useMemo(() => {
    if (state === 'approval' || state === 'approval-responded') {
      return (
        <div className="flex min-w-0 flex-1 flex-row items-center justify-start gap-1">
          <IconTerminalOutline18 className="size-3 shrink-0 text-warning" />
          <TruncatedCommandText
            text={explanation || 'Run command'}
            className="text-xs"
          />
        </div>
      );
    }

    if (state === 'denied') {
      return (
        <div className="flex min-w-0 flex-1 flex-row items-center justify-start gap-1">
          <IconTerminalOutline18 className="size-3 shrink-0" />
          <TruncatedCommandText
            text={explanation || 'Skipped command'}
            className="text-xs"
          />
          <span className="shrink-0 text-subtle-foreground text-xs">
            (skipped)
          </span>
        </div>
      );
    }

    if (state === 'error') {
      return (
        <div className="flex min-w-0 flex-1 flex-row items-center justify-start gap-1">
          <IconXmarkOutline18 className="size-3 shrink-0" />
          <TruncatedCommandText
            text={part.errorText ?? `Error running: ${command}`}
            className="text-xs"
          />
        </div>
      );
    }

    if (state === 'streaming') {
      return (
        <div className="flex w-full flex-row items-center justify-start gap-1">
          <IconLoader6Outline18 className="size-3 shrink-0 animate-spin text-primary-foreground" />
          <span className="flex min-w-0 gap-1 text-xs">
            <TruncatedCommandText
              text={
                explanation ||
                (isStdin
                  ? 'Sending input'
                  : isKill
                    ? 'Killing session'
                    : `Running ${command}`) ||
                '...'
              }
              className="shimmer-text-primary"
            />
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleCancel();
            }}
            className="-mr-2 ml-auto"
          >
            Cancel
          </Button>
        </div>
      );
    }

    const exitCode = output?.exit_code;
    const timedOut = output?.timed_out;
    const sessionExited = output?.session_exited;

    if (!timedOut) {
      return (
        <div className="pointer-events-none flex min-w-0 flex-1 flex-row items-center justify-start gap-1">
          <IconTerminalOutline18 className="size-3 shrink-0" />
          <TruncatedCommandText
            text={
              explanation ||
              (isStdin
                ? 'Sent input'
                : isKill
                  ? 'Killed session'
                  : 'Ran command')
            }
            className="text-xs"
          />
          {exitCode !== 0 && exitCode != null && (
            <span className="shrink-0 text-subtle-foreground text-xs">
              ({exitCode})
            </span>
          )}
        </div>
      );
    }

    let statusLabel: string;
    if (timedOut) statusLabel = 'timed out';
    else if (sessionExited) statusLabel = 'session exited';
    else if (exitCode === 0) statusLabel = 'exit 0';
    else if (exitCode !== null && exitCode !== undefined)
      statusLabel = `exit ${exitCode}`;
    else statusLabel = 'killed';
    // TODO: Make 'approve' and 'run', etc. have the same content height!!! (SO there are no jumps when approving and streaming starts)

    return (
      <div className="pointer-events-none flex flex-row items-center justify-start gap-1">
        <IconTerminalOutline18 className="size-3 shrink-0" />
        <span className="flex min-w-0 gap-1 text-xs">
          <span className="shrink-0 font-medium">
            {explanation || `Command ${statusLabel}`}
          </span>
        </span>
      </div>
    );
  }, [
    state,
    explanation,
    part.errorText,
    output?.exit_code,
    output?.timed_out,
    output?.session_exited,
  ]);

  const content = useMemo(() => {
    if (state === 'error') return undefined;

    const outputText =
      state === 'approval' ||
      state === 'approval-responded' ||
      state === 'denied'
        ? null
        : effectiveOutputText || null;

    return (
      <div className="px-2 py-1">
        <div
          className={cn(
            'whitespace-pre-wrap break-all pb-1 font-mono text-muted-foreground text-xs',
            outputText && 'pb-4',
          )}
        >
          {isStdin ? (
            <>
              <span className="select-none text-subtle-foreground">→ </span>
              {humanizeStdin(part.input?.stdin ?? '')}
            </>
          ) : isKill ? (
            <>
              <span className="select-none text-subtle-foreground">⊘ </span>
              Kill session
              {part.input?.session_id ? ` ${part.input.session_id}` : ''}
            </>
          ) : (
            <>
              <span className="select-none text-subtle-foreground">$ </span>
              {command}
            </>
          )}
        </div>
        {outputText && (
          <div className="mt-1 whitespace-pre-wrap break-all font-mono font-normal text-subtle-foreground text-xs">
            {outputText}
          </div>
        )}
      </div>
    );
  }, [
    state,
    effectiveOutputText,
    command,
    isStdin,
    isKill,
    part.input?.stdin,
    part.input?.session_id,
  ]);

  const contentFooter = useMemo(() => {
    if (
      (state === 'approval' || state === 'approval-responded') &&
      part.state !== 'input-streaming'
    )
      return (
        <div className="flex w-full flex-col gap-2.5">
          {classifierExplanation && (
            // <div className="mx-2 flex flex-row items-start gap-1.5 rounded-md border border-derived px-2 py-1.5 text-foreground text-xs leading-snug">
            <div className="mx-2 flex flex-row items-start gap-1.5 rounded-md px-1 py-0 text-warning-foreground text-xs leading-snug">
              <IconTriangleWarningOutline18 className="mt-[2px] size-3 shrink-0" />
              <div className="min-w-0 flex-1">{classifierExplanation}</div>
            </div>
          )}
          <div className="flex w-full flex-row items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              onClick={handleDeny}
              disabled={state === 'approval-responded'}
            >
              Skip
            </Button>
            {currentApprovalMode !== 'smart' && (
              <Tooltip>
                <TooltipTrigger delay={250}>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleSmartAllow}
                    disabled={state === 'approval-responded'}
                  >
                    Smart allow
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" align="end">
                  <div className="flex max-w-64 flex-col gap-1 py-1">
                    <div className="font-medium">
                      Ask only for risky commands
                    </div>
                    <div className="text-muted-foreground">
                      Switches this agent to smart approval. A fast classifier
                      decides per command — destructive or system-level commands
                      still require your approval.
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            <Button
              variant="primary"
              size="xs"
              onClick={handleApprove}
              disabled={state === 'approval-responded'}
            >
              {state === 'approval-responded' && (
                <IconLoader6Outline18 className="size-3 shrink-0 animate-spin" />
              )}
              Allow
            </Button>
          </div>
        </div>
      );
    return undefined;
  }, [
    state,
    handleApprove,
    handleDeny,
    handleSmartAllow,
    currentApprovalMode,
    classifierExplanation,
    part.state,
  ]);

  return (
    <ToolPartUI
      hideChevron={state === 'streaming'}
      showBorder={true}
      expanded={expanded}
      setExpanded={handleUserSetExpanded}
      isShimmering={state === 'streaming'}
      autoScroll={state === 'streaming'}
      trigger={trigger}
      content={content}
      contentFooter={contentFooter}
      contentFooterStatic={!!classifierExplanation}
      contentFooterClassName={cn(
        classifierExplanation ? 'px-2 py-1' : 'h-8 border-none px-1',
      )}
      contentClassName={cn(
        state === 'approval' || state === 'approval-responded'
          ? 'max-h-32 pb-0'
          : 'max-h-48 pb-0',
      )}
    />
  );
};

const STDIN_SEQUENCES: [string, string][] = [
  ['\x1b[A', 'Up'],
  ['\x1b[B', 'Down'],
  ['\x1b[C', 'Right'],
  ['\x1b[D', 'Left'],
  ['\x1b', 'Esc'],
  ['\x03', 'Ctrl+C'],
  ['\x04', 'Ctrl+D'],
  ['\x1a', 'Ctrl+Z'],
  ['\r', '↵'],
  ['\n', '↵'],
  ['\t', 'Tab'],
];

const CONTROL_LABELS = new Set(STDIN_SEQUENCES.map(([, label]) => label));

function humanizeStdin(raw: string): string {
  const tokens: string[] = [];
  let printable = '';
  let i = 0;

  while (i < raw.length) {
    let matched = false;
    for (const [pattern, label] of STDIN_SEQUENCES) {
      if (raw.startsWith(pattern, i)) {
        if (printable) {
          tokens.push(printable);
          printable = '';
        }
        tokens.push(label);
        i += pattern.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      printable += raw[i];
      i++;
    }
  }
  if (printable) tokens.push(printable);
  if (tokens.length === 0) return raw || '(empty)';

  const allControl = tokens.every((t) => CONTROL_LABELS.has(t));
  return allControl ? tokens.join(' ') : tokens.join('');
}

function TruncatedCommandText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const { isTruncated, tooltipOpen, setTooltipOpen } = useIsTruncated(ref);

  return (
    <Tooltip open={isTruncated && tooltipOpen} onOpenChange={setTooltipOpen}>
      <TooltipTrigger delay={50}>
        <span ref={ref} className={cn('min-w-0 truncate', className)}>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <div className="max-w-xs break-all">{text}</div>
      </TooltipContent>
    </Tooltip>
  );
}
