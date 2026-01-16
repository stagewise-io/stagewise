import type { ToolPart } from '@shared/karton-contracts/ui';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { TextSearchIcon } from 'lucide-react';

export const GrepSearchToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<ToolPart, { type: 'tool-grepSearchTool' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const streamingText = part.input?.query
    ? `Searching for ${part.input.query}...`
    : 'Searching with grep...';
  const finishedText =
    part.state === 'output-available' ? (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 truncate font-medium">Found </span>
        <span className="truncate font-normal opacity-75">
          {part.output?.result?.totalMatches ?? 0} result
          {part.output?.result?.totalMatches !== 1 ? 's' : ''}
          {part.input?.query && <> for "{part.input.query}"</>}
        </span>
      </span>
    ) : undefined;

  return (
    <ToolPartUINotCollapsible
      icon={<TextSearchIcon className="size-3 shrink-0" />}
      part={part}
      minimal={minimal}
      disableShimmer={disableShimmer}
      streamingText={streamingText}
      finishedText={finishedText}
    />
  );
};
