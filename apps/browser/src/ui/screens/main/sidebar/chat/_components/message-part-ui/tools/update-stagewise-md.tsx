import type { ToolPart } from '@shared/karton-contracts/ui';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { IconMagicWandSparkle } from 'nucleo-glass';

export const UpdateStagewiseMdToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<ToolPart, { type: 'tool-updateStagewiseMdTool' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const streamingText = `Updating project context...`;

  const finishedText =
    part.state === 'output-available' ? (
      <Tooltip>
        <TooltipTrigger>
          <span className="flex min-w-0 gap-1">
            <span className="shrink-0 truncate font-medium">Updated </span>
            <span className="truncate font-normal opacity-75">
              project context
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{part.input?.reason}</TooltipContent>
      </Tooltip>
    ) : undefined;

  return (
    <ToolPartUINotCollapsible
      icon={<IconMagicWandSparkle className="size-3 shrink-0" />}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
