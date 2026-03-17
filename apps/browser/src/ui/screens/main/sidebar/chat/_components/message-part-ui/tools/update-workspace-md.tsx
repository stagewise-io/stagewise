import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { IconMagicWandOutline18 } from 'nucleo-ui-outline-18';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';

export const UpdateWorkspaceMdToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-updateWorkspaceMd' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const streamingText = `Triggering update of WORKSPACE.md...`;

  const finishedText =
    part.state === 'output-available' ? (
      <Tooltip>
        <TooltipTrigger>
          <span className="flex min-w-0 gap-1">
            <span className="shrink-0 truncate font-medium">
              Triggered update{' '}
            </span>
            <span className="truncate font-normal opacity-75">
              of WORKSPACE.md
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{part.input?.updateReason}</TooltipContent>
      </Tooltip>
    ) : undefined;

  return (
    <ToolPartUINotCollapsible
      icon={<IconMagicWandOutline18 className="size-3 shrink-0" />}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
