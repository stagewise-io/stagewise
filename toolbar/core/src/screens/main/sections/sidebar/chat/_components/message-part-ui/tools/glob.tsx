import type { ToolPart } from '@stagewise/karton-contract';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { FileSearchIcon } from 'lucide-react';

export const GlobToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<ToolPart, { type: 'tool-globTool' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const streamingText = part.input?.pattern ? (
    <span className="flex min-w-0 gap-1">
      <span className="shrink-0">Searching for</span>
      <span className="truncate">{part.input.pattern}...</span>
    </span>
  ) : (
    'Searching files...'
  );

  const finishedText =
    part.state === 'output-available' ? (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 truncate font-semibold">Found </span>
        <span className="truncate font-normal">
          {part.output?.result?.totalMatches ?? 0} file
          {part.output?.result?.totalMatches !== 1 ? 's' : ''}
          {part.input?.pattern && <> matching "{part.input.pattern}"</>}
        </span>
      </span>
    ) : undefined;

  return (
    <ToolPartUINotCollapsible
      icon={<FileSearchIcon className="size-3 shrink-0" />}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
