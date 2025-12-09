import { Button } from '@/plugin-sdk';
import { IconMessagesFillDuo18 } from 'nucleo-ui-fill-duo-18';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { IconCommand } from 'nucleo-micro-bold';

type AgentPreviewBadgeProps = {
  onClick: () => void;
  unreadCount: number;
};

export function AgentPreviewBadge({
  onClick,
  unreadCount,
}: AgentPreviewBadgeProps) {
  return (
    <div className="flex h-full flex-row items-center rounded-lg rounded-br-[6px] p-1 pr-2">
      <Tooltip>
        <TooltipTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative shrink-0"
            onClick={onClick}
          >
            <IconMessagesFillDuo18 className="size-4 text-foreground/80" />
            {unreadCount > 0 && (
              <div className="absolute top-0.5 right-0.5 flex size-3 items-center justify-center rounded-full bg-yellow-300 opacity-80">
                <span className="font-mono text-[10px] text-yellow-700">2</span>
              </div>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-row items-center gap-1">
            <span className="text-xs">Toggle chat panel</span>
            <div className="pointer-events-none flex shrink-0 flex-row items-center gap-0 opacity-40">
              <IconCommand className="size-3 text-muted-foreground" />
              <span className="font-mono text-muted-foreground text-xs">I</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
