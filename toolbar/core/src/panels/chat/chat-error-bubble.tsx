import { cn } from '@/utils';
import { Button } from '@/components/ui/button';
import { AgentErrorType, type AgentError } from '@stagewise/karton-contract';
import { RefreshCcwIcon } from 'lucide-react';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import Markdown from 'react-markdown';

const needsExtraCreditsMessage = `Oh no, you ran out of credits!\n\nYou can [buy extra credits here](https://console.stagewise.io/billing/checkout-extra-credits) so we can continue working on your app 💪`;
const needsSubscriptionMessage = `Wow, looks like you ran out of included credits in your trial!\n\nLet's [setup your subscription](https://console.stagewise.io/billing/checkout) so we can continue working on your app 💪`;

export function ChatErrorBubble({ error }: { error: AgentError }) {
  const retrySendingUserMessage = useKartonProcedure(
    (p) => p.retrySendingUserMessage,
  );

  const subscription = useKartonState((s) => s.subscription);

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
            error.type === AgentErrorType.INSUFFICIENT_CREDITS
              ? 'min-w-1/3 origin-bottom-left rounded-bl-xs bg-zinc-100/60 text-zinc-950 ring-zinc-950/5'
              : 'min-w-1/3 origin-bottom-left rounded-bl-xs bg-rose-600/90 text-white ring-rose-100/5',
          )}
        >
          <Markdown>
            {error.type === AgentErrorType.INSUFFICIENT_CREDITS
              ? subscription?.hasSubscription
                ? needsExtraCreditsMessage
                : needsSubscriptionMessage
              : error.error.message}
          </Markdown>
          {error.type !== AgentErrorType.INSUFFICIENT_CREDITS && (
            <span className="mt-2 block text-xs italic">
              {error.type}: {error.error.name}
            </span>
          )}
        </div>

        <div className="flex h-full min-w-12 grow flex-row items-center justify-start">
          <Button
            aria-label={'Retry'}
            variant="secondary"
            glassy
            onClick={() => void retrySendingUserMessage()}
            className="!opacity-100 z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg hover:bg-white/60 active:bg-zinc-50/60 disabled:bg-transparent disabled:shadow-none disabled:*:stroke-zinc-500/50"
          >
            <RefreshCcwIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
