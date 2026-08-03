import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import type { CreateWatcherSessionToolOutput } from '@shared/karton-contracts/ui/agent/tools/types';
import { IconPowerOffOutline18, IconXmarkOutline18 } from '@stagewise/icons';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Radar } from '@ui/components/ui/radar';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { formatDuration } from '@ui/utils/format-duration';
import { cn } from '@ui/utils';
import { ChevronDownIcon, EyeIcon } from 'lucide-react';
import { ShellCommandPreview } from './shared/shell-command-preview';
import {
  ShellToolApprovalFooter,
  useShellToolApproval,
} from './shared/shell-tool-approval';
import { ToolPartUI } from './shared/tool-part-ui';
import { useToolAutoExpand } from './shared/use-tool-auto-expand';

type CreateWatcherSessionPart = Extract<
  AgentToolUIPart,
  { type: 'tool-createWatcherSession' }
>;

type WatcherToolState =
  | 'approval'
  | 'approval-responded'
  | 'denied'
  | 'error'
  | 'streaming'
  | 'success';

type WatcherOutcome = 'triggered' | 'timed_out' | 'failed';

function getWatcherToolState(part: CreateWatcherSessionPart): WatcherToolState {
  if (part.state === 'approval-requested' || part.state === 'input-streaming')
    return 'approval';
  if (part.state === 'approval-responded') return 'approval-responded';
  if (part.state === 'input-available') return 'streaming';
  if (part.state === 'output-denied') return 'denied';
  if (part.state === 'output-error') return 'error';
  return 'success';
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

const STATE_LABELS: Record<WatcherToolState, string> = {
  approval: 'Creating watcher',
  'approval-responded': 'Creating watcher',
  denied: 'Watcher skipped',
  error: 'Watcher failed',
  streaming: 'Creating watcher',
  success: 'Created watcher',
};

const OUTCOME_TIMING_LABELS: Record<WatcherOutcome, string> = {
  triggered: 'Triggered',
  timed_out: 'Timed out',
  failed: 'Failed',
};

export function CreateWatcherSessionToolPart({
  part,
  isLastPart = false,
}: {
  part: CreateWatcherSessionPart;
  isLastPart?: boolean;
}) {
  const state = getWatcherToolState(part);
  const output = part.output as CreateWatcherSessionToolOutput | undefined;
  const [openAgentId] = useOpenAgent();
  const killShellSession = useKartonProcedure(
    (procedures) => procedures.toolbox.killShellSession,
  );
  const watcherRuntimeState = useKartonState((appState) => {
    if (!openAgentId || !output?.session_id) return null;
    const session = appState.toolbox[openAgentId]?.shells?.sessions.find(
      ({ id }) => id === output.session_id,
    );
    if (session) {
      if (!session.exited) return 'active';
      return session.watcherResult
        ? `finished:${session.watcherResult.outcome}:${session.watcherResult.finishedAt}`
        : 'stopped-manually';
    }

    const eventMessage = appState.agents.instances[
      openAgentId
    ]?.state.history.find(
      (message) =>
        message.metadata?.watcherEvent?.sessionId === output.session_id,
    );
    const event = eventMessage?.metadata?.watcherEvent;
    const eventCreatedAt = eventMessage?.metadata?.createdAt;
    if (!event || !eventCreatedAt) return 'stopped';

    const finishedAt = new Date(eventCreatedAt).getTime();
    return Number.isFinite(finishedAt)
      ? `finished:${event.outcome}:${finishedAt}`
      : `finished:${event.outcome}`;
  });
  const approval = useShellToolApproval(part);
  const { expanded, handleUserSetExpanded } = useToolAutoExpand({
    isStreaming: state === 'streaming' || state === 'approval',
    isLastPart,
  });

  const input = part.input;
  const title = input?.title ?? 'Watcher';
  const description = input?.description;
  const command = input?.command ?? '';
  const timeoutMs = input?.timeout_ms;
  const watcherActive = watcherRuntimeState === 'active';
  const watcherStoppedManually = watcherRuntimeState === 'stopped-manually';
  const watcherStopped = watcherRuntimeState === 'stopped';
  const finishedState = watcherRuntimeState?.startsWith('finished:')
    ? watcherRuntimeState.split(':')
    : null;
  const watcherOutcome = finishedState?.[1] as WatcherOutcome | undefined;
  const watcherFinishedAt = finishedState?.[2]
    ? Number(finishedState[2])
    : null;
  const timingLabel = watcherStoppedManually
    ? 'Stopped manually'
    : watcherStopped
      ? 'Stopped when the app closed'
      : watcherOutcome
        ? watcherFinishedAt
          ? `${OUTCOME_TIMING_LABELS[watcherOutcome]} ${formatTimestamp(watcherFinishedAt)}`
          : OUTCOME_TIMING_LABELS[watcherOutcome]
        : output?.expires_at
          ? `Expires ${formatTimestamp(output.expires_at)}`
          : typeof timeoutMs === 'number'
            ? `Runs for up to ${formatDuration(timeoutMs, { style: 'long' })}`
            : null;
  const isCreating =
    state === 'approval' ||
    state === 'approval-responded' ||
    state === 'streaming';

  const trigger = (
    <div className="relative flex w-full overflow-hidden px-3 py-2.5 text-left">
      <div className="relative z-10 flex min-w-0 flex-1 flex-col items-start">
        <div
          className={cn(
            'flex items-center gap-1 text-xs',
            isCreating && 'text-warning-foreground',
            state === 'success' &&
              (watcherActive
                ? 'text-primary-foreground'
                : 'text-muted-foreground'),
            state === 'error' && 'text-error-foreground',
            state === 'denied' && 'text-muted-foreground',
          )}
        >
          {state === 'error' ? (
            <IconXmarkOutline18 className="size-3 shrink-0" />
          ) : (
            <EyeIcon
              className={cn(
                'size-3 shrink-0',
                isCreating && 'animate-pulse-full',
              )}
            />
          )}
          <span>{STATE_LABELS[state]}</span>
          <ChevronDownIcon
            className={cn(
              'size-3 text-subtle-foreground transition-transform duration-150',
              expanded && 'rotate-180',
            )}
          />
        </div>
        <div className="mt-1 max-w-full truncate text-foreground text-sm">
          {title}
        </div>
        {description ? (
          <div className="mt-1 line-clamp-3 max-w-full whitespace-pre-wrap text-muted-foreground text-xs leading-4">
            {description}
          </div>
        ) : null}
        {timingLabel ? (
          <span className="mt-1.5 text-subtle-foreground text-xs">
            {timingLabel}
          </span>
        ) : null}
      </div>
      {state === 'success' && watcherActive ? (
        <div
          className="absolute -right-[15rem] -bottom-[18.75rem] size-[40rem] opacity-40 blur-[0.5px]"
          style={{
            maskImage:
              'radial-gradient(circle, black 35%, rgb(0 0 0 / 75%) 55%, transparent 72%)',
            WebkitMaskImage:
              'radial-gradient(circle, black 35%, rgb(0 0 0 / 75%) 55%, transparent 72%)',
          }}
        >
          <Radar
            brightness={0.8}
            color="var(--color-primary-foreground)"
            enableMouseInteraction={false}
            ringCount={16}
            ringSpeed={0}
            ringThickness={0.03}
            scale={0.65}
            speed={1}
            spokeThickness={0.007}
            sweepWidth={7}
          />
        </div>
      ) : null}
    </div>
  );

  const showApprovalFooter =
    (state === 'approval' || state === 'approval-responded') &&
    part.state !== 'input-streaming';
  const contentFooter = showApprovalFooter ? (
    <ShellToolApprovalFooter
      approval={approval}
      isResponded={state === 'approval-responded'}
    />
  ) : undefined;

  return (
    <div className="relative">
      <ToolPartUI
        className="border-border-subtle bg-background shadow-elevation-1 dark:bg-surface-1"
        triggerClassName="h-auto items-stretch rounded-b-none border-b-0 bg-background p-0 text-left hover:bg-background active:bg-background dark:bg-surface-1 dark:hover:bg-surface-1 dark:active:bg-surface-1"
        hideChevron
        showBorder
        flushContent
        expanded={expanded}
        setExpanded={handleUserSetExpanded}
        autoScroll={false}
        trigger={trigger}
        content={
          <ShellCommandPreview className="bg-background px-3 py-2 dark:bg-surface-1">
            {command}
          </ShellCommandPreview>
        }
        contentFooter={contentFooter}
        contentFooterStatic={!!approval.classifierExplanation}
        contentFooterClassName={cn(
          approval.classifierExplanation ? 'px-2 py-1' : 'h-8 border-none px-1',
          'bg-background dark:bg-surface-1',
        )}
        contentClassName="py-0!"
      />
      {watcherActive && openAgentId && output?.session_id ? (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-2 right-2 z-20 bg-background/70 backdrop-blur-sm hover:text-error-foreground dark:bg-surface-1/70"
              aria-label={`Stop ${title}`}
              onClick={() =>
                void killShellSession(openAgentId, output.session_id)
              }
            >
              <IconPowerOffOutline18 className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop watcher</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
