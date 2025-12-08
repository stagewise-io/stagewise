import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import type { TabState } from '@shared/karton-contracts/ui';
import type { ReactElement } from 'react';

export function WithTabTooltipPreview({
  tabState,
  children,
  enabled = true,
}: {
  tabState: TabState;
  children: ReactElement;
  enabled?: boolean;
}) {
  if (!enabled) return children;
  return (
    <Tooltip>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent>{tabState.title}</TooltipContent>
    </Tooltip>
  );
}
