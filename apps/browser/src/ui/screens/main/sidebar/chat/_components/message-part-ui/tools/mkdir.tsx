import { useMemo } from 'react';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { IconFolderPlusOutline18 } from 'nucleo-ui-outline-18';
import { stripMountPrefix } from '@ui/utils';

export const MkdirToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-mkdir' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const dirPath = part.input?.path ?? '';
  const displayPath = dirPath ? stripMountPrefix(dirPath) : undefined;

  const icon = <IconFolderPlusOutline18 className="size-3 shrink-0" />;

  const streamingText = useMemo(() => {
    if (displayPath) return `Creating ${displayPath}...`;
    return 'Creating directory...';
  }, [displayPath]);

  const finishedText = useMemo(() => {
    if (part.state !== 'output-available') return undefined;
    return (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 font-medium">Created</span>
        <span className="truncate font-normal opacity-75">
          {displayPath ?? ''}
        </span>
      </span>
    );
  }, [part.state, displayPath]);

  return (
    <ToolPartUINotCollapsible
      icon={icon}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
