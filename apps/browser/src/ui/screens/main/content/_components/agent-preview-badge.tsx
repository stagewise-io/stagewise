import { Button } from '@stagewise/stage-ui/components/button';
import { IconSidebarLeftShowOutline18 } from 'nucleo-ui-outline-18';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { HotkeyActions } from '@shared/hotkeys';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import { useKartonState } from '@ui/hooks/use-karton';
import { cn } from '@ui/utils';
import { useOpenAgent } from '@ui/hooks/use-open-chat';

type AgentPreviewBadgeProps = {
  onClick: () => void;
};

export function AgentPreviewBadge({ onClick }: AgentPreviewBadgeProps) {
  const [openAgent] = useOpenAgent();
  const isWorking = useKartonState((s) =>
    openAgent ? s.agents.instances[openAgent]?.state.isWorking : false,
  );

  return (
    <div className="flex h-full shrink-0 flex-row items-center rounded-lg rounded-br-[6px] p-1 pr-2">
      <Tooltip>
        <TooltipTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative shrink-0"
            onClick={onClick}
          >
            <IconSidebarLeftShowOutline18
              className={cn(
                'size-4',
                isWorking ? 'animate-icon-pulse text-primary' : '',
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-row items-center gap-1.5">
            <span className="text-xs">Toggle chat panel</span>
            <HotkeyCombo
              action={HotkeyActions.TOGGLE_CONTEXT_SELECTOR}
              size="xs"
            />
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
