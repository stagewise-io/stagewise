import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { EyeIcon } from 'lucide-react';
import { stripMountPrefix } from '@ui/utils';

export const ReadFileToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-readFile' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const displayPath = part.input?.relative_path
    ? stripMountPrefix(part.input.relative_path)
    : undefined;

  const streamingText = displayPath
    ? `Reading ${displayPath}...`
    : 'Reading file...';

  const finishedText =
    part.state === 'output-available' ? (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 truncate font-medium">Read </span>
        <span className="truncate font-normal opacity-75">
          {displayPath ?? ''}
          {part.output?.result?.linesRead && (
            <> ({part.output?.result?.linesRead} lines)</>
          )}
        </span>
      </span>
    ) : undefined;

  return (
    <ToolPartUINotCollapsible
      icon={<EyeIcon className="size-3 shrink-0" />}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
