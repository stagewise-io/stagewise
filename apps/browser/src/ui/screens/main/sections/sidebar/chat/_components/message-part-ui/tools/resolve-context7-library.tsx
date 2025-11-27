import type { ToolPart } from '@shared/karton-contracts/ui';
import { ToolPartUINotCollapsible } from './shared/tool-part-ui-not-collapsible';
import { FileSearchIcon } from 'lucide-react';

export const ResolveContext7LibraryToolPart = ({
  part,
  disableShimmer = false,
  minimal = false,
}: {
  part: Extract<ToolPart, { type: 'tool-resolveContext7LibraryTool' }>;
  disableShimmer?: boolean;
  minimal?: boolean;
}) => {
  const streamingText = part.input?.library
    ? `Searching latest docs for ${part.input.library}...`
    : 'Searching latest docs...';

  const finishedText =
    part.state === 'output-available' ? (
      <span className="flex min-w-0 gap-1">
        <span className="shrink-0 truncate font-semibold">Found</span>
        <span className="truncate font-normal">
          {part.output?.results.length ?? 0} results for {part.input?.library}
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
