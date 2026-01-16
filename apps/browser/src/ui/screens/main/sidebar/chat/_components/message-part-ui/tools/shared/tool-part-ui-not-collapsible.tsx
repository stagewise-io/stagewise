import { memo, useMemo } from 'react';
import type { ToolUIPart } from '@shared/karton-contracts/ui';
import type { DynamicToolUIPart } from '@shared/karton-contracts/ui';
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
              'flex cursor-default flex-row items-center justify-start gap-1 text-muted-foreground text-xs hover:text-foreground',
            )}
          >
            {icon && <div className="size-3 shrink-0">{icon}</div>}
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
              'flex min-w-0 cursor-default flex-row items-center justify-start gap-1 text-muted-foreground text-xs hover:text-foreground',
            )}
          >
            {icon && (
              <div
                className={`size-3 shrink-0 ${disableShimmer ? '' : 'animate-icon-pulse text-primary-foreground hover:text-primary-foreground'}`}
              >
                {icon}
              </div>
            )}
            <span
              className={`truncate ${disableShimmer ? '' : 'shimmer-text-primary'}`}
            >
              {streamingText}
            </span>
          </div>
        );
      }

      if (part.state === 'output-error') {
        return (
          <div className="flex max-w-full cursor-default flex-row items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
            <XIcon className="size-3 shrink-0" />
            <Tooltip>
              <TooltipTrigger>
                <span className="min-w-0 truncate text-xs">
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
