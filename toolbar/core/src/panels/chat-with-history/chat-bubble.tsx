import { cn } from '@/utils';
import { useState } from 'react';

export function ChatBubble(props: {
  fromAgent: boolean;
  message: string;
  timestamp: Date;
  ToolCalls: {
    name: string;
    args: Record<string, any>;
  }[];
}) {
  const [toolCallsExpanded, _setToolCallsExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'mt-2 flex w-full shrink-0 items-center justify-start gap-2',
          props.fromAgent ? 'flex-row' : 'flex-row-reverse',
        )}
      >
        <div
          className={cn(
            'group relative flex min-h-8 items-center rounded-2xl bg-white/5 px-2.5 py-1 font-normal text-sm ring-1 ring-inset',
            props.fromAgent
              ? 'rounded-bl-xs bg-zinc-200/50 text-zinc-950 ring-zinc-950/5'
              : 'rounded-br-xs bg-blue-600/90 text-white ring-white/5',
          )}
        >
          <div className="group-hover:-top-3 -top-2 absolute left-1 z-20 rounded-full bg-white/90 px-1.5 py-0.5 text-xs text-zinc-950/80 opacity-0 shadow-sm ring-1 ring-zinc-500/10 ring-inset transition-all duration-150 ease-out group-hover:opacity-100">
            2 minutes ago
          </div>
          <p className="whitespace-pre-wrap">{props.message}</p>
        </div>

        <div className="min-w-12 grow" />
      </div>
      {props.ToolCalls.length > 0 && (
        <div
          className={cn(
            'flex h-[calc-size(auto,size)] flex-col gap-1',
            toolCallsExpanded
              ? 'flex-col gap-2 rounded-xl'
              : 'absolute top-[calc(100%-6px)] left-1 flex-row gap-1 rounded-2xl',
          )}
        >
          {props.ToolCalls.map((toolCall) => (
            <div key={toolCall.name}>{toolCall.name}</div>
          ))}
        </div>
      )}
    </div>
  );
}
