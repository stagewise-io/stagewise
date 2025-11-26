import { memo } from 'react';
import type { ToolUIPart } from '@stagewise/karton-contract';
import type { DynamicToolUIPart } from '@stagewise/karton-contract';
import { cn } from '@/utils';
import { XIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { ToolPartUI } from './tool-part-ui';

export const ToolPartUINotCollapsible = memo(
  ({
    streamingText,
    finishedText,
    part,
    disableShimmer = false,
    minimal = false,
    icon,
    content,
  }: {
    streamingText: string | React.ReactNode;
    finishedText: string | React.ReactNode | undefined;
    part: ToolUIPart | DynamicToolUIPart;
    disableShimmer?: boolean;
    minimal?: boolean;
    icon?: React.ReactNode;
    content?: React.ReactNode;
  }) => {
    let trigger: React.ReactNode = null;
    // If we have finished text, show it
    if (part.state === 'output-available') {
      trigger = (
        <div
          className={cn(
            'flex flex-row items-center justify-start gap-1 text-muted-foreground text-xs',
          )}
        >
          {icon && (
            <div className="size-3 shrink-0 text-muted-foreground">{icon}</div>
          )}
          {finishedText ?? `Finished`}
        </div>
      );
    }

    if (part.state === 'input-streaming' || part.state === 'input-available') {
      trigger = (
        <div
          className={cn(
            'flex min-w-0 flex-row items-center justify-start gap-1 text-xs',
            disableShimmer
              ? 'text-muted-foreground'
              : 'shimmer-text shimmer-duration-1500 shimmer-from-primary shimmer-to-blue-300',
          )}
        >
          {icon && (
            <div
              className={`size-3 shrink-0 ${disableShimmer ? 'text-muted-foreground' : 'text-primary'}`}
            >
              {icon}
            </div>
          )}
          {streamingText}
        </div>
      );
    }

    if (part.state === 'output-error')
      trigger = (
        <div className="flex max-w-full flex-row items-center gap-1 text-muted-foreground text-xs">
          <XIcon className="size-3 shrink-0" />
          <Tooltip>
            <TooltipTrigger>
              <span className="min-w-0 truncate text-muted-foreground text-xs">
                {part.errorText ?? 'Error'}
              </span>
            </TooltipTrigger>
            <TooltipContent>{part.errorText ?? 'Error'}</TooltipContent>
          </Tooltip>
        </div>
      );

    return minimal ? (
      trigger
    ) : (
      <ToolPartUI trigger={trigger} content={content} />
    );
  },
);
