import { useMemo } from 'react';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { IconFolder5Outline18 } from 'nucleo-ui-outline-18';
import { stripMountPrefix } from '@ui/utils';

export const LsToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-ls' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const dirPath = part.input?.path ?? '';
  const displayPath = dirPath ? stripMountPrefix(dirPath) : undefined;

  const streamingText = useMemo(() => {
    if (displayPath) return `Listing ${displayPath}...`;
    return 'Listing directory...';
  }, [displayPath]);

  const finishedText = useMemo(() => {
    if (part.state !== 'output-available') return undefined;
    return (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 font-medium">Listed</span>
        <span className="truncate font-normal opacity-75">
          {displayPath ?? ''}
        </span>
      </span>
    );
  }, [part.state, displayPath]);

  return (
    <ToolPartUINotCollapsible
      icon={<IconFolder5Outline18 className="size-3 shrink-0" />}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
