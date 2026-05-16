import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import {
  IconSidebarRightHideOutline18,
  IconSidebarRightShowOutline18,
} from 'nucleo-ui-outline-18';
import { useContentCollapsed } from './content-collapsed-context';

export function ContentToggleButton() {
  const { collapsed, toggle } = useContentCollapsed();
  const label = collapsed ? 'Show content panel' : 'Hide content panel';
  const Icon = collapsed
    ? IconSidebarRightShowOutline18
    : IconSidebarRightHideOutline18;
  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={toggle}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
