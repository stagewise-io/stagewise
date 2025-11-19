import { cn } from '@/utils';
import { AgentErrorType, type AgentError } from '@stagewise/karton-contract';
import { RefreshCcwIcon } from 'lucide-react';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import Markdown from 'react-markdown';
import { useMemo } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';

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
  process.env.STAGEWISE_CONSOLE_URL || 'https://console.stagewise.io';

const discordLink =
  process.env.DISCORD_INVITE_LINK || 'https://discord.gg/gkdGsDYaKA';

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

  const isHandledError = useMemo(() => {
    return (
      error.type === AgentErrorType.INSUFFICIENT_CREDITS ||
      error.type === AgentErrorType.PLAN_LIMITS_EXCEEDED
    );
  }, [error.type]);

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'mt-2 flex w-full shrink-0 flex-row items-center justify-start gap-2',
        )}
      >
        <div
          className={cn(
            'markdown group relative min-h-8 animate-chat-bubble-appear space-y-3 break-words rounded-2xl bg-white/5 px-2.5 py-1.5 font-normal text-sm shadow-lg shadow-zinc-950/10 ring-1 ring-inset last:mb-0.5',
            isHandledError
              ? 'min-w-48 origin-bottom-left rounded-bl-xs bg-zinc-100/60 text-zinc-950 ring-zinc-950/5 dark:bg-zinc-800/60 dark:text-zinc-50'
              : 'min-w-48 origin-bottom-left rounded-bl-xs bg-rose-600/90 text-white ring-rose-100/5',
          )}
        >
          <Markdown>{errorMessage}</Markdown>
          {!isHandledError && (
            <span className="mt-2 block text-xs italic">
              {error.type}: {error.error.name}
            </span>
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
