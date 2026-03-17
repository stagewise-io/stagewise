import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { getTruncatedFileUrl, stripMountPrefix } from '@ui/utils';
import { FolderOpenIcon } from 'lucide-react';

export const ListFilesToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-listFiles' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const pathWithoutPrefix = stripMountPrefix(part.input?.relative_path ?? '');
  const isRoot =
    !pathWithoutPrefix ||
    pathWithoutPrefix === '/' ||
    pathWithoutPrefix === '.';
  const verb = part.input?.includeDirectories ? 'directories' : 'files';
  const streamingText = isRoot
    ? `Listing ${verb}...`
    : `Listing ${verb} in ${getTruncatedFileUrl(pathWithoutPrefix)}...`;
  const finishedText =
    part.state === 'output-available' ? (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 truncate font-medium">Listed </span>
        <span className="truncate font-normal opacity-75">
          {part.output?.result?.totalFiles} {verb}
          {!isRoot && <> in {getTruncatedFileUrl(pathWithoutPrefix)}</>}
        </span>
      </span>
    ) : undefined;

  return (
    <ToolPartUINotCollapsible
      icon={<FolderOpenIcon className="size-3 shrink-0" />}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
