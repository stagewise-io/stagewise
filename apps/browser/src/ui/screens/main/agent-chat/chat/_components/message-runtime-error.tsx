import { useState } from 'react';
import { IconTriangleWarning } from '@stagewise/icons';
import { Button } from '@stagewise/stage-ui/components/button';
import { RefreshCcwIcon, CopyIcon, CopyCheckIcon } from 'lucide-react';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import type { AgentRuntimeError } from '@shared/karton-contracts/ui/agent';
import { useCmdEnterTarget } from '@ui/hooks/use-cmd-enter-target';
import { CmdEnterPriority } from '@ui/utils/cmd-enter-registry';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import { HotkeyActions } from '@shared/hotkeys';

export function MessageRuntimeError({
  agentInstanceId,
  error,
  onRetry,
  canRetry,
  isWorking = false,
}: {
  agentInstanceId: string;
  error: AgentRuntimeError;
  onRetry: () => void;
  canRetry: boolean;
  /** Suppress retry while the agent is streaming. */
  isWorking?: boolean;
}) {
  const canShowRetry = canRetry || !isWorking;
  const { setRef: retryRef, isWinner: retryIsWinner } = useCmdEnterTarget({
    id: `message-runtime-error-retry-${agentInstanceId}`,
    priority: CmdEnterPriority.ERROR_RETRY,
    action: onRetry,
    enabled: canShowRetry,
  });
  const openExternalUrl = useKartonProcedure((p) => p.openExternalUrl);
  const openSettings = useKartonProcedure((p) => p.appScreen.openSettings);
  const [hasCopied, setHasCopied] = useState(false);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const retiredRoute =
    error.kind === 'plan-limit-exceeded' ||
    error.kind === 'model-restricted' ||
    error.kind === 'subscription-required';
  const heading = retiredRoute
    ? 'Configure a model provider'
    : error.kind === 'upstream-overload'
      ? 'Model is temporarily unavailable'
      : error.kind === 'waiting-for-connection'
        ? 'Waiting for connection...'
        : 'Error';
  const description = retiredRoute
    ? 'Managed inference is no longer available. Connect a provider subscription, API key, or custom endpoint to continue.'
    : error.kind === 'upstream-overload'
      ? 'The upstream AI provider is temporarily at capacity. Please switch to another model or try again.'
      : error.kind === 'waiting-for-connection'
        ? 'Your device appears to be offline. The agent will retry automatically once internet access is available again.'
        : error.message;
  const copyError = () => {
    void navigator.clipboard.writeText(JSON.stringify(error, null, 2));
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };
  const reportIssueUrl = `https://github.com/stagewise-io/stagewise/issues/new?template=5.agent_issue.yml&conversation-id=${agentInstanceId}&error-data=${encodeURIComponent(JSON.stringify(error))}`;

  return (
    <div className="mt-6 flex w-full flex-col gap-1.5 rounded-lg border border-derived-strong p-2 text-sm">
      <div className="flex flex-row items-center gap-1.5">
        <IconTriangleWarning className="size-3.5 shrink-0 text-error-foreground" />
        <span className="font-medium text-foreground">{heading}</span>
        <Button
          variant="ghost"
          size="icon-2xs"
          className="ml-auto"
          onClick={copyError}
          aria-label="Copy error"
        >
          {hasCopied ? (
            <CopyCheckIcon className="size-3" />
          ) : (
            <CopyIcon className="size-3" />
          )}
        </Button>
      </div>
      <div className="text-foreground">{description}</div>
      {error.kind === 'waiting-for-connection' && (
        <div className="text-muted-foreground text-xs">
          Last network error: {error.originalMessage}
        </div>
      )}
      {!error.kind && (
        <>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setHelpExpanded((value) => !value)}
          >
            What to do if the issue persists?
          </Button>
          {helpExpanded && (
            <div className="text-muted-foreground text-xs">
              If this error continues to occur, you can{' '}
              <a
                href={reportIssueUrl}
                rel="noopener noreferrer"
                onClick={(event) => {
                  event.preventDefault();
                  void openExternalUrl(reportIssueUrl);
                }}
                className="text-primary-foreground underline"
              >
                report it on GitHub
              </a>
              . Include the error message and stack trace, if available.
            </div>
          )}
        </>
      )}
      <div className="flex flex-row justify-end gap-2 pt-1">
        {retiredRoute && (
          <Button
            variant="primary"
            size="xs"
            onClick={() => void openSettings({ section: 'models-providers' })}
          >
            Configure provider
          </Button>
        )}
        {canShowRetry && (
          <Button ref={retryRef} variant="ghost" size="xs" onClick={onRetry}>
            <RefreshCcwIcon className="size-3" />
            Retry
            {retryIsWinner && (
              <HotkeyCombo
                action={HotkeyActions.CMD_ENTER}
                size="xs"
                variant="ghost"
                className="ml-0.5"
              />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
