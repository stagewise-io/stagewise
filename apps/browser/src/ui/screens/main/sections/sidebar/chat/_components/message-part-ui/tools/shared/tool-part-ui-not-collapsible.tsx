import { memo, useMemo } from 'react';
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
    streamingText: string;
    finishedText: string | React.ReactNode | undefined;
    part: ToolUIPart | DynamicToolUIPart;
    disableShimmer?: boolean;
    minimal?: boolean;
    icon?: React.ReactNode;
    content?: React.ReactNode;
  }) => {
    const trigger = useMemo(() => {
      if (part.state === 'output-available') {
        return (
          <div
            className={cn(
              'flex flex-row items-center justify-start gap-1 text-muted-foreground text-xs',
            )}
          >
            {icon && (
              <div className="size-3 shrink-0 text-muted-foreground">
                {icon}
              </div>
            )}
            <span className="min-w-0 truncate">
              {finishedText ?? `Finished`}
            </span>
          </div>
        );
      }

      if (
        part.state === 'input-streaming' ||
        part.state === 'input-available'
      ) {
        return (
          <div
            className={cn(
              'flex min-w-0 flex-row items-center justify-start gap-1 text-xs',
            )}
          >
            {icon && (
              <div
                className={`size-3 shrink-0 ${disableShimmer ? 'text-muted-foreground' : 'text-primary'}`}
              >
                {icon}
              </div>
            )}
            <span
              className={`truncate ${disableShimmer ? 'text-muted-foreground' : 'shimmer-text shimmer-duration-1500 shimmer-from-primary shimmer-to-blue-300'}`}
            >
              {streamingText}
            </span>
          </div>
        );
      }

      if (part.state === 'output-error') {
        return (
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
      }
    }, [
      part.state,
      part.errorText,
      icon,
      finishedText,
      streamingText,
      disableShimmer,
    ]);

    return minimal ? (
      trigger
    ) : (
      <ToolPartUI trigger={trigger} content={content} />
    );
  },
);
