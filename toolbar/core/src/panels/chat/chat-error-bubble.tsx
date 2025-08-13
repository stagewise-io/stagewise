import { cn } from '@/utils';
import { Button } from '@/components/ui/button';
import type { AgentError } from '@stagewise/karton-contract';
import { RefreshCcwIcon } from 'lucide-react';
import { useKartonProcedure } from '@/hooks/use-karton';

export function ChatErrorBubble({ error }: { error: AgentError }) {
  const retrySendingUserMessage = useKartonProcedure(
    (p) => p.retrySendingUserMessage,
  );

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'mt-2 flex w-full shrink-0 flex-row items-center justify-start gap-2',
        )}
      >
        <div
          className={cn(
            'group relative min-h-8 animate-chat-bubble-appear space-y-3 break-words rounded-2xl bg-white/5 px-2.5 py-1.5 font-normal text-sm shadow-lg shadow-zinc-950/10 ring-1 ring-inset last:mb-0.5',
            'min-w-48 origin-bottom-left rounded-bl-xs bg-rose-600/90 text-white ring-rose-100/5',
          )}
        >
          {error.error.message}
          <span className="mt-2 block text-xs italic">{error.error.name}</span>
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
