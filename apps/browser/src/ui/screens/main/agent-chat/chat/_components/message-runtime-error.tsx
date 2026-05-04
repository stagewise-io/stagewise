import { useState, useMemo } from 'react';
import { cn } from '@ui/utils';
import { IconTriangleWarning } from 'nucleo-micro-bold';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import {
  RefreshCcwIcon,
  CopyIcon,
  CopyCheckIcon,
  ArrowUpRightIcon,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@stagewise/stage-ui/components/collapsible';
import { ChevronDownIcon } from 'lucide-react';
import { useKartonState } from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { availableModels } from '@shared/available-models';
import type { ModelProvider } from '@shared/karton-contracts/ui/shared-types';
import type { AgentRuntimeError } from '@shared/karton-contracts/ui/agent';

const consoleUrl =
  import.meta.env.VITE_STAGEWISE_CONSOLE_URL || 'https://console.stagewise.io';

type GenericRuntimeError = Extract<AgentRuntimeError, { kind?: undefined }>;

/** Check if an error message indicates an API authorization failure */
function isAuthorizationError(error: GenericRuntimeError): boolean {
  const msg = error.message.toLowerCase();
  const code = error.code;
  if (code === 401 || code === 403) return true;
  return (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthorized') ||
    msg.includes('authentication') ||
    msg.includes('unauthenticated') ||
    msg.includes('invalid api key') ||
    msg.includes('invalid x-api-key') ||
    msg.includes('no api key') ||
    msg.includes('missing api key') ||
    msg.includes('api key provided') ||
    msg.includes('permission denied') ||
    msg.includes('access denied')
  );
}

function formatRelativeTime(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return 'shortly';
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;

  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours !== 1 ? 's' : ''}`;

  const days = Math.ceil(hours / 24);
  return `in ${days} day${days !== 1 ? 's' : ''}`;
}

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
  /** Whether the agent is currently streaming. Used to suppress Retry in UIs
   *  that bypass the `canRetry` last-message gate (e.g. upstream-overload). */
  isWorking?: boolean;
}) {
  if (error.kind === 'upstream-overload') {
    return (
      <UpstreamOverloadError
        error={error}
        isWorking={isWorking}
        onRetry={onRetry}
      />
    );
  }

  if (error.kind === 'plan-limit-exceeded') {
    return (
      <PlanLimitExceededError
        error={error}
        canRetry={canRetry}
        onRetry={onRetry}
      />
    );
  }

  return (
    <GenericError
      agentInstanceId={agentInstanceId}
      error={error}
      canRetry={canRetry}
      onRetry={onRetry}
    />
  );
}

function PlanLimitExceededError({
  error,
}: {
  error: Extract<AgentRuntimeError, { kind: 'plan-limit-exceeded' }>;
  canRetry: boolean;
  onRetry: () => void;
}) {
  const subscription = useKartonState((s) => s.userAccount.subscription);
  const plan = subscription?.plan;

  const resetsAt = error.exceededWindows[0]?.resetsAt;
  const resetLabel = resetsAt ? formatRelativeTime(resetsAt) : null;

  const { heading, description, ctaLabel, ctaHref } = useMemo(() => {
    const resetSuffix = resetLabel ? ` Your limit resets ${resetLabel}.` : '';

    switch (plan) {
      case 'ultra':
        return {
          heading: 'Usage limit reached',
          description: `You've used all your included credits.${resetSuffix}`,
          ctaLabel: 'Get more credits',
          ctaHref: `${consoleUrl}/billing/checkout-extra-credits`,
        };
      case 'pro':
        return {
          heading: 'Usage limit reached',
          description: `You've reached your Pro plan limit.${resetSuffix}`,
          ctaLabel: 'Upgrade to Ultra',
          ctaHref: `${consoleUrl}/billing/checkout`,
        };
      default:
        return {
          heading: 'Usage limit reached',
          description: `You've reached your free plan limit.${resetSuffix}`,
          ctaLabel: 'Set up a subscription',
          ctaHref: `${consoleUrl}/billing/checkout`,
        };
    }
  }, [plan, resetLabel]);

  return (
    <div className="mt-6 flex w-full flex-col gap-2 rounded-lg border border-derived bg-surface-1 p-3 text-sm">
      <span className="font-medium text-foreground">{heading}</span>

      <span className="text-muted-foreground text-xs">{description}</span>

      <div className="flex flex-row items-center justify-end gap-2 pt-2">
        <a
          href="stagewise://internal/agent-settings/models-providers"
          className={buttonVariants({ variant: 'ghost', size: 'xs' })}
        >
          Configure API keys
        </a>

        <Button
          variant="primary"
          size="xs"
          onClick={() => window.open(ctaHref, '_blank', 'noopener,noreferrer')}
        >
          {ctaLabel}
          <ArrowUpRightIcon className="size-3" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Shows a formal, non-alarming card for upstream-provider overload errors
 * (429/502/503/529, Anthropic `overloaded_error`).
 *
 * Retry is shown whenever the agent is not currently streaming. We
 * intentionally bypass the shared `canRetry` gate (which requires the tail
 * of history to be a user message) because `onError` often fires after an
 * empty assistant message has been appended, yet the backend's
 * `retryLastUserMessage` walks history backward to find the last user
 * message and works regardless.
 */
function UpstreamOverloadError({
  error,
  isWorking,
  onRetry,
}: {
  error: Extract<AgentRuntimeError, { kind: 'upstream-overload' }>;
  isWorking: boolean;
  onRetry: () => void;
}) {
  const description =
    'The upstream AI provider is temporarily at capacity. Please switch to another model or try again.';

  // Read the name from the error snapshot (not live state) so that switching
  // the active model while the card is visible does not mislabel the heading.
  const modelName = useMemo(() => {
    if (!error.modelId) return null;
    const m = availableModels.find((m) => m.modelId === error.modelId);
    return m?.modelDisplayName ?? null;
  }, [error.modelId]);
  const heading = modelName
    ? `${modelName} is temporarily unavailable`
    : 'Model is temporarily unavailable';

  return (
    <div className="mt-6 flex w-full flex-col gap-2 rounded-lg border border-derived bg-surface-1 p-3 text-sm">
      <span className="font-medium text-foreground">{heading}</span>

      <span className="text-muted-foreground text-xs">{description}</span>

      {!isWorking && (
        <div className="flex flex-row items-center justify-end gap-2 pt-2">
          <Button variant="primary" size="xs" onClick={onRetry}>
            <RefreshCcwIcon className="size-3" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

function GenericError({
  agentInstanceId,
  error,
  canRetry,
  onRetry,
}: {
  agentInstanceId: string;
  error: GenericRuntimeError;
  canRetry: boolean;
  onRetry: () => void;
}) {
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [openAgent] = useOpenAgent();

  const activeModelId = useKartonState((s) =>
    openAgent ? s.agents.instances[openAgent]?.state.activeModelId : undefined,
  );

  const providerConfigs = useKartonState((s) => s.preferences?.providerConfigs);

  const showSignInLink = useMemo(() => {
    if (!isAuthorizationError(error)) return false;
    if (!activeModelId || !providerConfigs) return false;

    const builtInModel = availableModels.find(
      (m) => m.modelId === activeModelId,
    );
    if (!builtInModel) return false;

    const provider = builtInModel.officialProvider as ModelProvider | undefined;
    if (!provider) return false;
    return providerConfigs[provider]?.mode === 'stagewise';
  }, [error, activeModelId, providerConfigs]);

  const copyError = () => {
    const errorText = `Error${error.code ? ` (Code: ${error.code})` : ''}: ${error.message}${error.stack ? `\n\nStack trace:\n${error.stack}` : ''}`;
    navigator.clipboard.writeText(errorText);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  return (
    <div className="mt-6 flex w-full flex-col gap-1.5 rounded-lg border border-derived-strong p-2 text-sm">
      <div className="flex flex-row items-center gap-1.5">
        <IconTriangleWarning className="size-3.5 shrink-0 text-error-foreground" />
        <span className="font-medium text-error-foreground">Error</span>
        <Button
          variant="ghost"
          size="icon-2xs"
          className="ml-auto"
          onClick={copyError}
        >
          {hasCopied ? (
            <CopyCheckIcon className="size-3" />
          ) : (
            <CopyIcon className="size-3" />
          )}
        </Button>
      </div>

      <div className="text-foreground">
        {error.message}{' '}
        {error.code && (
          <span className="text-muted-foreground text-xs">
            (Code: {error.code})
          </span>
        )}
      </div>

      {showSignInLink && (
        <div className="text-muted-foreground text-xs">
          Please{' '}
          <a
            href="stagewise://internal/account"
            className="text-primary-foreground underline hover:text-primary-foreground/80"
          >
            sign in to stagewise
          </a>{' '}
          to continue.
        </div>
      )}

      <Collapsible open={helpExpanded} onOpenChange={setHelpExpanded}>
        <CollapsibleTrigger
          size="condensed"
          className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 py-0.5"
        >
          <span className="text-xs">What to do if the issue persists?</span>
          <ChevronDownIcon
            className={cn(
              'size-3 transition-transform',
              helpExpanded && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-0.5 text-muted-foreground text-xs">
            If this error continues to occur, you can{' '}
            <a
              href={`https://github.com/stagewise-io/stagewise/issues/new?template=5.agent_issue.yml&conversation-id=${agentInstanceId}&error-data=${encodeURIComponent(JSON.stringify(error))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-foreground underline hover:text-primary-foreground/80"
            >
              report it on GitHub
            </a>
            . Please include the error message and stack trace (if available) to
            help us diagnose the issue.
          </div>
        </CollapsibleContent>
      </Collapsible>

      {canRetry && (
        <div className="-mt-1 flex flex-row justify-end">
          <Button variant="ghost" size="xs" onClick={onRetry}>
            <RefreshCcwIcon className="size-3" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
