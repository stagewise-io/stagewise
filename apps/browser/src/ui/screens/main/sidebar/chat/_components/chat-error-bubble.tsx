import { cn } from '@/utils';
import { useState } from 'react';
import { IconTriangleWarning } from 'nucleo-micro-bold';
import { AgentErrorType, type AgentError } from '@shared/karton-contracts/ui';
import { RefreshCcwIcon, CopyIcon, CopyCheckIcon } from 'lucide-react';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { Streamdown } from '@/components/streamdown';
import { useCallback, useMemo } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';

/** Maximum characters to display in error messages (UI-level safety net) */
const MAX_DISPLAY_LENGTH = 250;

/**
 * Sanitizes and truncates error messages to prevent leaking sensitive content.
 * This is a UI-level safety net in case backend sanitization fails.
 */
function sanitizeDisplayMessage(message: string | undefined): string {
  if (!message || typeof message !== 'string') {
    return 'An unexpected error occurred.';
  }

  // Truncate to max length
  const truncated =
    message.length > MAX_DISPLAY_LENGTH
      ? `${message.slice(0, MAX_DISPLAY_LENGTH)}...`
      : message;

  return truncated;
}

const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    if (days === 1 && remainingHours === 0) {
      return '1 day';
    } else if (remainingHours === 0) {
      return `${days} days`;
    } else if (days === 1) {
      return `1 day and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
    } else {
      return `${days} days and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
    }
  }

  if (remainingMinutes === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }

  return `${hours} hour${hours !== 1 ? 's' : ''} and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
};

const consoleUrl =
  import.meta.env.VITE_STAGEWISE_CONSOLE_URL || 'https://console.stagewise.io';

const discordLink =
  import.meta.env.VITE_DISCORD_INVITE_LINK || 'https://discord.gg/gkdGsDYaKA';

const needsExtraCreditsMessage = `Oh no, you ran out of credits!\n\nYou can [buy extra credits here](${consoleUrl}/billing/checkout-extra-credits) so we can continue working on your app 💪`;
const needsSubscriptionMessage = `Wow, looks like you ran out of included credits in your trial!\n\nLet's [setup your subscription](${consoleUrl}/billing/checkout) so we can continue working on your app 💪`;
const freeTrialPlanLimitExceededMessage = (minutes?: number) =>
  minutes !== undefined
    ? `Wow, looks like you ran out of your daily prompts in your trial!\n\nYou can [setup a subscription](${consoleUrl}/billing/checkout) or wait ${formatDuration(minutes)} before your next request 💪`
    : `Wow, looks like you ran out of your daily prompts in your trial!\n\nYou can [setup a subscription](${consoleUrl}/billing/checkout) so we can continue working on your app 💪`;

const paidPlanLimitExceededMessage = (minutes?: number) =>
  minutes !== undefined
    ? `Wow, looks like you ran out of your daily prompts in your subscription!\n\nYou need to wait ${formatDuration(minutes)} before your next request or [ping the stagewise team on Discord](${discordLink}) 💪`
    : `Wow, looks like you ran out of your daily prompts in your subscription!\n\nYou can wait until the cooldown period ends (max 24 hours) or [ping the stagewise team on Discord](${discordLink}) 💪`;

export function ChatErrorBubble({ error }: { error: AgentError }) {
  const retrySendingUserMessage = useKartonProcedure(
    (p) => p.agentChat.retrySendingUserMessage,
  );

  const subscription = useKartonState((s) => s.userAccount.subscription);

  const errorMessage = useMemo(() => {
    switch (error.type) {
      case AgentErrorType.INSUFFICIENT_CREDITS:
        return subscription?.active
          ? needsExtraCreditsMessage
          : needsSubscriptionMessage;
      case AgentErrorType.PLAN_LIMITS_EXCEEDED:
        return subscription?.active
          ? paidPlanLimitExceededMessage(error.error.cooldownMinutes)
          : freeTrialPlanLimitExceededMessage(error.error.cooldownMinutes);
      case AgentErrorType.CONTEXT_LIMIT_EXCEEDED:
        return 'This chat exceeds the context limit. Please start a new chat.';
      default:
        return error.error.message;
    }
  }, [error, subscription?.active]);

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'mt-2 flex w-full shrink-0 flex-row items-center justify-start gap-2',
        )}
      >
        <div
          className={cn(
            'markdown group wrap-break-word relative min-h-8 space-y-3 rounded-lg border border-derived-subtle bg-surface-1 px-2.5 py-1.5 font-normal text-sm last:mb-0.5',
            'min-w-48 origin-bottom-left',
          )}
        >
          {error.type === AgentErrorType.AGENT_ERROR ? (
            <AgentErrorMessage error={error} />
          ) : error.type === AgentErrorType.OTHER ? (
            <OtherErrorMessage error={error} />
          ) : (
            <Streamdown isAnimating={false}>{errorMessage}</Streamdown>
          )}
        </div>

        <div className="flex h-full min-w-12 grow flex-row items-center justify-start">
          <Button
            aria-label={'Retry'}
            variant="secondary"
            size="icon-sm"
            onClick={() => void retrySendingUserMessage()}
          >
            <RefreshCcwIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

type AgentErrorWithStructuredError = Extract<
  AgentError,
  { type: AgentErrorType.AGENT_ERROR }
>;

function AgentErrorMessage({
  error,
}: {
  error: AgentErrorWithStructuredError;
}) {
  const heading = useMemo(() => {
    switch (error.error.errorType) {
      case 'AI_APICallError':
        return 'API Error';
      case 'AI_InvalidArgumentError':
        return 'Internal Error';
      case 'NetworkError':
        return 'Network Error';
      case 'AI_TypeValidationError':
        return 'Processing Error';
      default:
        // Generic heading for other internal errors
        return 'Error';
    }
  }, [error.error.errorType]);

  const displayMessage = useMemo(
    () => sanitizeDisplayMessage(error.error.message),
    [error.error.message],
  );

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(
      JSON.stringify(
        { errorType: error.error.errorType, error: error.error },
        null,
        2,
      ),
    );
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  }, [displayMessage]);

  const [hasCopied, setHasCopied] = useState(false);

  return (
    <div className="flex select-text flex-col gap-1">
      <div className="flex select-text flex-row items-baseline justify-start gap-1">
        <IconTriangleWarning className="size-3 translate-y-[2px]" />
        <span className="select-text font-medium text-foreground text-sm">
          {heading}
        </span>
        <Button
          variant="ghost"
          size="icon-2xs"
          className="ml-auto"
          onClick={() => void copyToClipboard()}
        >
          {hasCopied ? (
            <CopyCheckIcon className="size-3" />
          ) : (
            <CopyIcon className="size-3" />
          )}
        </Button>
      </div>
      <span className="select-text text-muted-foreground text-xs">
        <Streamdown isAnimating={false}>{displayMessage}</Streamdown>
      </span>
    </div>
  );
}

type AgentErrorWithOtherError = Extract<
  AgentError,
  { type: AgentErrorType.OTHER }
>;
function OtherErrorMessage({ error }: { error: AgentErrorWithOtherError }) {
  const displayMessage = useMemo(() => {
    const name = error.error.name || 'Error';
    const message = sanitizeDisplayMessage(error.error.message);
    return `${name} - ${message}`;
  }, [error.error.name, error.error.message]);

  return (
    <div className="flex select-text flex-col gap-1">
      <div className="flex select-text flex-row items-baseline justify-start gap-1">
        <IconTriangleWarning className="size-3 translate-y-[2px]" />
        <span className="select-text font-medium text-foreground text-sm">
          Agent Error
        </span>
      </div>
      <span className="select-text text-muted-foreground text-xs">
        <Streamdown isAnimating={false}>{displayMessage}</Streamdown>
      </span>
    </div>
  );
}
